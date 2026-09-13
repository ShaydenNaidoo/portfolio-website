package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Admin editing of the About section (name, headline, bio, about text,
// languages, experience), certifications (with an optional PDF/image
// attachment) and the CV. Everything lands in SiteData, persisted to MongoDB
// when available with data/site_data.json as seed and fallback.

type AboutUpdateRequest struct {
	DisplayName *string       `json:"displayName"`
	Headline    *string       `json:"headline"`
	Bio         *string       `json:"bio"`
	About       *string       `json:"about"`
	Languages   *[]string     `json:"languages"`
	Experience  *[]Experience `json:"experience"`
}

type CertificationRequest struct {
	Name    string `json:"name"`
	Issuer  string `json:"issuer"`
	Date    string `json:"date"`
	URL     string `json:"url"`
	FileURL string `json:"fileUrl"` // from POST /api/admin/images, or "" to detach
}

type CVUploadRequest struct {
	FileData string `json:"fileData"` // data:application/pdf;base64,...
}

func newID(prefix string) string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return prefix + hex.EncodeToString(b)
}

func trimField(s string, max int) string {
	s = strings.TrimSpace(s)
	if utf8Len(s) > max {
		return string([]rune(s)[:max])
	}
	return s
}

// validateHTTPURL allows only http(s) links so a stored URL can never be a
// javascript: or data: payload when rendered as an href.
func validateHTTPURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	if len(raw) > 2048 {
		return "", fmt.Errorf("link is too long")
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return "", fmt.Errorf("link must be a full http(s):// URL")
	}
	return raw, nil
}

// ensureCertificationIDs gives legacy entries stable ids so they can be
// addressed by the edit/delete endpoints.
func ensureCertificationIDs(certs []Certification) bool {
	changed := false
	for i := range certs {
		if certs[i].ID == "" {
			certs[i].ID = newID("cert-")
			changed = true
		}
	}
	return changed
}

// ---- profile persistence -------------------------------------------------

type siteProfileDoc struct {
	ID   string `bson:"id"`
	JSON string `bson:"json"`
}

// profileSnapshot is SiteData without the blog posts, which live in their
// own collection.
func (a *App) profileSnapshotLocked() SiteData {
	snap := a.siteData
	snap.BlogPosts = nil
	return snap
}

func (m *MongoStore) LoadSiteProfile() (*SiteData, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	var doc siteProfileDoc
	err := m.siteProfile.FindOne(ctx, bson.M{"id": "current"}).Decode(&doc)
	if err != nil {
		if strings.Contains(err.Error(), "no documents") {
			return nil, nil
		}
		return nil, err
	}
	var data SiteData
	if err := json.Unmarshal([]byte(doc.JSON), &data); err != nil {
		return nil, err
	}
	return &data, nil
}

func (m *MongoStore) SaveSiteProfile(data SiteData) error {
	data.BlogPosts = nil
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_, err = m.siteProfile.ReplaceOne(ctx, bson.M{"id": "current"},
		siteProfileDoc{ID: "current", JSON: string(b)}, options.Replace().SetUpsert(true))
	return err
}

// ---- handlers ------------------------------------------------------------

// PUT /api/admin/about — partial update of the About section.
func (a *App) handleAdminAbout(w http.ResponseWriter, r *http.Request) {
	if !a.isAuthorizedAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPut && r.Method != http.MethodPatch {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var in AboutUpdateRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10)).Decode(&in); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	a.mu.Lock()
	if in.DisplayName != nil {
		if name := trimField(*in.DisplayName, 80); name != "" {
			a.siteData.DisplayName = name
		}
	}
	if in.Headline != nil {
		a.siteData.Headline = trimField(*in.Headline, 160)
	}
	if in.Bio != nil {
		a.siteData.Bio = trimField(*in.Bio, 600)
	}
	if in.About != nil {
		a.siteData.About = trimField(*in.About, 4000)
	}
	if in.Languages != nil {
		a.siteData.Languages = cleanLanguageList(*in.Languages)
	}
	if in.Experience != nil {
		cleaned := make([]Experience, 0, len(*in.Experience))
		for _, exp := range *in.Experience {
			exp.Role = trimField(exp.Role, 160)
			exp.Company = trimField(exp.Company, 160)
			exp.DateRange = trimField(exp.DateRange, 80)
			points := make([]string, 0, len(exp.Description))
			for _, p := range exp.Description {
				if p = trimField(p, 600); p != "" {
					points = append(points, p)
				}
			}
			exp.Description = points
			if exp.Role == "" && exp.Company == "" {
				continue
			}
			cleaned = append(cleaned, exp)
			if len(cleaned) == 30 {
				break
			}
		}
		a.siteData.Experience = cleaned
	}
	err := a.saveSiteDataLocked()
	snap := a.profileSnapshotLocked()
	a.mu.Unlock()
	if err != nil {
		http.Error(w, "failed to save profile", http.StatusInternalServerError)
		return
	}
	respondJSON(w, map[string]any{"status": "updated", "profile": snap, "storage": a.storageMode()})
}

// POST   /api/admin/certifications        add
// PUT    /api/admin/certifications/<id>   edit
// DELETE /api/admin/certifications/<id>   remove (and its attachment)
func (a *App) handleAdminCertifications(w http.ResponseWriter, r *http.Request) {
	if !a.isAuthorizedAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/certifications"), "/")

	if r.Method == http.MethodDelete {
		if id == "" {
			http.Error(w, "certification id required", http.StatusBadRequest)
			return
		}
		a.mu.Lock()
		kept := make([]Certification, 0, len(a.siteData.Certifications))
		var removedFile string
		found := false
		for _, c := range a.siteData.Certifications {
			if c.ID == id {
				found = true
				removedFile = imageIDFromURL(c.FileURL)
				continue
			}
			kept = append(kept, c)
		}
		if !found {
			a.mu.Unlock()
			http.Error(w, "certification not found", http.StatusNotFound)
			return
		}
		a.siteData.Certifications = kept
		err := a.saveSiteDataLocked()
		a.mu.Unlock()
		if err != nil {
			http.Error(w, "failed to save profile", http.StatusInternalServerError)
			return
		}
		if removedFile != "" {
			_ = a.deleteImage(removedFile)
		}
		respondJSON(w, map[string]any{"status": "deleted", "certifications": kept})
		return
	}

	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var in CertificationRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&in); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	name := trimField(in.Name, 160)
	if name == "" {
		http.Error(w, "certification name is required", http.StatusBadRequest)
		return
	}
	link, err := validateHTTPURL(in.URL)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	fileURL := strings.TrimSpace(in.FileURL)
	if fileURL != "" {
		fid := imageIDFromURL(fileURL)
		if fid == "" {
			http.Error(w, "attachment must be a file uploaded through the admin uploader", http.StatusBadRequest)
			return
		}
		stored, err := a.loadImage(fid)
		if err != nil || stored == nil {
			http.Error(w, "attachment not found; upload it again", http.StatusBadRequest)
			return
		}
		prefix := fileURLPrefix
		if _, isImage := imageExtensions[stored.ContentType]; isImage {
			prefix = imageURLPrefix
		}
		fileURL = prefix + fid
	}
	cert := Certification{
		Name:    name,
		Issuer:  trimField(in.Issuer, 160),
		Date:    trimField(in.Date, 40),
		URL:     link,
		FileURL: fileURL,
	}

	a.mu.Lock()
	var staleFile string
	status := "added"
	if r.Method == http.MethodPost {
		if len(a.siteData.Certifications) >= 50 {
			a.mu.Unlock()
			http.Error(w, "too many certifications (max 50)", http.StatusBadRequest)
			return
		}
		cert.ID = newID("cert-")
		a.siteData.Certifications = append(a.siteData.Certifications, cert)
	} else {
		idx := -1
		for i := range a.siteData.Certifications {
			if a.siteData.Certifications[i].ID == id {
				idx = i
				break
			}
		}
		if idx < 0 {
			a.mu.Unlock()
			http.Error(w, "certification not found", http.StatusNotFound)
			return
		}
		previous := a.siteData.Certifications[idx]
		if previous.FileURL != "" && previous.FileURL != cert.FileURL {
			staleFile = imageIDFromURL(previous.FileURL)
		}
		cert.ID = previous.ID
		a.siteData.Certifications[idx] = cert
		status = "updated"
	}
	err = a.saveSiteDataLocked()
	certs := append([]Certification(nil), a.siteData.Certifications...)
	a.mu.Unlock()
	if err != nil {
		http.Error(w, "failed to save profile", http.StatusInternalServerError)
		return
	}
	if staleFile != "" {
		_ = a.deleteImage(staleFile)
	}
	respondJSON(w, map[string]any{"status": status, "certification": cert, "certifications": certs})
}

// POST /api/admin/cv {fileData} — replaces the CV; the previous upload is deleted.
func (a *App) handleAdminCV(w http.ResponseWriter, r *http.Request) {
	if !a.isAuthorizedAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var in CVUploadRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 12<<20)).Decode(&in); err != nil {
		http.Error(w, "invalid body (or file over the 8MB limit)", http.StatusBadRequest)
		return
	}
	contentType, data, err := decodeFileDataURL(in.FileData)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if contentType != "application/pdf" {
		http.Error(w, "the CV must be a PDF", http.StatusBadRequest)
		return
	}
	stored, err := a.storeImage(contentType, data, "cv")
	if err != nil {
		http.Error(w, "failed to store CV", http.StatusInternalServerError)
		return
	}
	newURL := fileURLPrefix + stored.ID

	a.mu.Lock()
	old := imageIDFromURL(a.siteData.CVURL)
	a.siteData.CVURL = newURL
	err = a.saveSiteDataLocked()
	a.mu.Unlock()
	if err != nil {
		http.Error(w, "failed to save profile", http.StatusInternalServerError)
		return
	}
	if old != "" && old != stored.ID {
		_ = a.deleteImage(old)
	}
	respondJSON(w, map[string]any{"status": "updated", "cvUrl": newURL, "size": stored.Size})
}
