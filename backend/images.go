package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Uploaded images (repo card art, later blog photos) are stored as raw bytes
// — one document per image in MongoDB, or a file under data/images without
// it — and served from /api/images/<id>. Documents that reference an image
// only carry its URL, so profile/repo payloads stay small and browsers cache
// each image independently. The browser shrinks images to WebP before
// upload; the server just enforces the ceiling.

const (
	imagesDir        = "data/images"
	maxStoredImage   = 2 << 20 // 2MB after client-side compression
	maxStoredPDF     = 8 << 20 // certificates and the CV are uploaded as-is
	imageURLPrefix   = "/api/images/"
	fileURLPrefix    = "/api/files/"
	imageAdminPrefix = "/api/admin/images"
)

type StoredImage struct {
	ID          string `bson:"id"`
	ContentType string `bson:"contentType"`
	Data        []byte `bson:"data"`
	Size        int    `bson:"size"`
	Kind        string `bson:"kind"` // "repo", "blog"…
	CreatedAt   string `bson:"createdAt"`
}

type ImageUploadRequest struct {
	ImageData string `json:"imageData"` // data:image/...;base64,...
	Kind      string `json:"kind"`
}

// Allowed upload types. Deliberately no SVG or HTML: both can carry scripts
// and would execute on this origin when opened directly.
var imageExtensions = map[string]string{
	"image/webp": ".webp",
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/gif":  ".gif",
	"image/avif": ".avif",
}

var documentExtensions = map[string]string{
	"application/pdf": ".pdf",
}

func allowedExtension(contentType string) (string, bool) {
	if ext, ok := imageExtensions[contentType]; ok {
		return ext, true
	}
	ext, ok := documentExtensions[contentType]
	return ext, ok
}

// sniffMatches checks the declared type against the file's magic bytes so a
// renamed executable or HTML file cannot be stored under an image/PDF label.
func sniffMatches(contentType string, data []byte) bool {
	has := func(prefix string) bool { return len(data) >= len(prefix) && string(data[:len(prefix)]) == prefix }
	switch contentType {
	case "application/pdf":
		return has("%PDF-")
	case "image/png":
		return has("\x89PNG\r\n\x1a\n")
	case "image/jpeg":
		return has("\xff\xd8\xff")
	case "image/gif":
		return has("GIF87a") || has("GIF89a")
	case "image/webp":
		return len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP"
	case "image/avif":
		return len(data) >= 12 && string(data[4:8]) == "ftyp"
	}
	return false
}

// decodeImageDataURL validates an image data URL and returns its type and bytes.
func decodeImageDataURL(dataURL string) (string, []byte, error) {
	contentType, data, err := decodeFileDataURL(dataURL)
	if err != nil {
		return "", nil, err
	}
	if _, ok := imageExtensions[contentType]; !ok {
		return "", nil, fmt.Errorf("unsupported image type %q (use webp, jpeg, png, gif or avif)", contentType)
	}
	return contentType, data, nil
}

// decodeFileDataURL validates any allowed data URL (image or PDF).
func decodeFileDataURL(dataURL string) (string, []byte, error) {
	dataURL = strings.TrimSpace(dataURL)
	if !strings.HasPrefix(dataURL, "data:") {
		return "", nil, fmt.Errorf("file must be a base64 data URL")
	}
	header, payload, ok := strings.Cut(dataURL, ",")
	if !ok || !strings.Contains(strings.ToLower(header), ";base64") {
		return "", nil, fmt.Errorf("file data URL must be base64 encoded")
	}
	contentType := strings.ToLower(strings.TrimSuffix(strings.TrimPrefix(header, "data:"), ";base64"))
	if _, known := allowedExtension(contentType); !known {
		return "", nil, fmt.Errorf("unsupported file type %q (use PDF, webp, jpeg, png, gif or avif)", contentType)
	}
	data, err := base64.StdEncoding.DecodeString(strings.TrimSpace(payload))
	if err != nil {
		return "", nil, fmt.Errorf("invalid base64 file data")
	}
	if len(data) == 0 {
		return "", nil, fmt.Errorf("file payload is empty")
	}
	limit := maxStoredImage
	if contentType == "application/pdf" {
		limit = maxStoredPDF
	}
	if len(data) > limit {
		return "", nil, fmt.Errorf("file too large (%d KB; max %d KB)", len(data)/1024, limit/1024)
	}
	if !sniffMatches(contentType, data) {
		return "", nil, fmt.Errorf("file content does not match its declared type %q", contentType)
	}
	return contentType, data, nil
}

func (a *App) storeImage(contentType string, data []byte, kind string) (StoredImage, error) {
	sum := sha256.Sum256(data)
	img := StoredImage{
		// Content-addressed: re-uploading the same bytes reuses the id, and
		// random-looking ids let the URL be cached forever.
		ID:          hex.EncodeToString(sum[:16]),
		ContentType: contentType,
		Data:        data,
		Size:        len(data),
		Kind:        kind,
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	}
	if a.mongoStore != nil {
		return img, a.mongoStore.UpsertImage(img)
	}
	if err := os.MkdirAll(imagesDir, 0o755); err != nil {
		return img, err
	}
	ext, _ := allowedExtension(contentType)
	return img, os.WriteFile(filepath.Join(imagesDir, img.ID+ext), data, 0o644)
}

func (a *App) loadImage(id string) (*StoredImage, error) {
	if a.mongoStore != nil {
		return a.mongoStore.LoadImage(id)
	}
	for _, table := range []map[string]string{imageExtensions, documentExtensions} {
		for contentType, ext := range table {
			data, err := os.ReadFile(filepath.Join(imagesDir, id+ext))
			if err == nil {
				return &StoredImage{ID: id, ContentType: contentType, Data: data, Size: len(data)}, nil
			}
		}
	}
	return nil, nil
}

func (a *App) deleteImage(id string) error {
	if a.mongoStore != nil {
		return a.mongoStore.DeleteImage(id)
	}
	for _, table := range []map[string]string{imageExtensions, documentExtensions} {
		for _, ext := range table {
			_ = os.Remove(filepath.Join(imagesDir, id+ext))
		}
	}
	return nil
}

// imageIDFromURL extracts the id from a URL this server issued (either the
// /api/images/ or /api/files/ form); "" otherwise.
func imageIDFromURL(u string) string {
	u = strings.TrimSpace(u)
	prefix := imageURLPrefix
	idx := strings.Index(u, prefix)
	if idx < 0 {
		prefix = fileURLPrefix
		idx = strings.Index(u, prefix)
	}
	if idx < 0 {
		return ""
	}
	id := strings.Trim(u[idx+len(prefix):], "/")
	if len(id) != 32 {
		return ""
	}
	if _, err := hex.DecodeString(id); err != nil {
		return ""
	}
	return id
}

// validateExternalImageURL accepts a plain https link to an image hosted
// elsewhere (GitHub, a CDN…), which costs no storage here.
func validateExternalImageURL(raw string) error {
	if len(raw) > 2048 {
		return fmt.Errorf("image link is too long")
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return fmt.Errorf("image link must be a full https:// URL")
	}
	return nil
}

// safeDownloadName builds a filename from a caller-supplied label without
// letting header-breaking or path characters through.
func safeDownloadName(label, id, ext string) string {
	var b strings.Builder
	for _, r := range strings.TrimSpace(label) {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_', r == '.':
			b.WriteRune(r)
		case r == ' ':
			b.WriteRune('_')
		}
		if b.Len() >= 80 {
			break
		}
	}
	name := strings.Trim(b.String(), "._")
	if name == "" {
		name = id
	}
	if !strings.HasSuffix(strings.ToLower(name), ext) {
		name += ext
	}
	return name
}

func validImageID(id string) bool {
	if len(id) != 32 {
		return false
	}
	_, err := hex.DecodeString(id)
	return err == nil
}

// GET /api/images/<id>  or  /api/files/<id>[/<display-name>]
func (a *App) handleImage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	rest := strings.TrimPrefix(strings.TrimPrefix(r.URL.Path, imageURLPrefix), fileURLPrefix)
	id, _, _ := strings.Cut(strings.Trim(rest, "/"), "/")
	if !validImageID(id) {
		http.NotFound(w, r)
		return
	}
	img, err := a.loadImage(id)
	if err != nil {
		http.Error(w, "failed to load image", http.StatusInternalServerError)
		return
	}
	if img == nil {
		http.NotFound(w, r)
		return
	}
	// Ids are content hashes, so the bytes behind a URL never change.
	w.Header().Set("Content-Type", img.ContentType)
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("ETag", `"`+img.ID+`"`)
	// Never let the browser reinterpret the bytes, and keep anything a
	// viewer might execute (PDF scripting) isolated from this origin.
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "sandbox; default-src 'none'")
	name := r.URL.Query().Get("name")
	ext, _ := allowedExtension(img.ContentType)
	w.Header().Set("Content-Disposition", "inline; filename=\""+safeDownloadName(name, img.ID, ext)+"\"")
	if strings.Contains(r.Header.Get("If-None-Match"), img.ID) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Length", fmt.Sprint(len(img.Data)))
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(img.Data)
}

// POST   /api/admin/images        {imageData, kind} -> {id, url, size}
// DELETE /api/admin/images/<id>
func (a *App) handleAdminImages(w http.ResponseWriter, r *http.Request) {
	if !a.isAuthorizedAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	switch r.Method {
	case http.MethodPost:
		var in ImageUploadRequest
		// Base64 of a 2MB image is ~2.7MB; leave headroom for the JSON wrapper.
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 12<<20)).Decode(&in); err != nil {
			http.Error(w, "invalid body (or image over the size limit)", http.StatusBadRequest)
			return
		}
		contentType, data, err := decodeFileDataURL(in.ImageData)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		kind := strings.ToLower(strings.TrimSpace(in.Kind))
		if kind == "" {
			kind = "misc"
		}
		img, err := a.storeImage(contentType, data, kind)
		if err != nil {
			http.Error(w, "failed to store image", http.StatusInternalServerError)
			return
		}
		urlPrefix := imageURLPrefix
		if _, isImage := imageExtensions[contentType]; !isImage {
			urlPrefix = fileURLPrefix
		}
		respondJSON(w, map[string]any{
			"id":   img.ID,
			"url":  urlPrefix + img.ID,
			"size": img.Size,
			"type": img.ContentType,
		})
	case http.MethodDelete:
		id := strings.Trim(strings.TrimPrefix(r.URL.Path, imageAdminPrefix), "/")
		if !validImageID(id) {
			http.Error(w, "invalid image id", http.StatusBadRequest)
			return
		}
		if err := a.deleteImage(id); err != nil {
			http.Error(w, "failed to delete image", http.StatusInternalServerError)
			return
		}
		respondJSON(w, map[string]any{"status": "deleted", "id": id})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (m *MongoStore) UpsertImage(img StoredImage) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_, err := m.images.ReplaceOne(ctx, bson.M{"id": img.ID}, img, options.Replace().SetUpsert(true))
	return err
}

func (m *MongoStore) LoadImage(id string) (*StoredImage, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	var img StoredImage
	err := m.images.FindOne(ctx, bson.M{"id": id}).Decode(&img)
	if err != nil {
		if strings.Contains(err.Error(), "no documents") {
			return nil, nil
		}
		return nil, err
	}
	return &img, nil
}

func (m *MongoStore) DeleteImage(id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_, err := m.images.DeleteOne(ctx, bson.M{"id": id})
	return err
}
