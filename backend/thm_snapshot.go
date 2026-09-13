package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// TryHackMe now fronts its API with a Vercel bot challenge that a server-side
// client cannot pass, so live fetches routinely fail with HTTP 429. The last
// good payload is persisted as a snapshot (MongoDB when configured, otherwise
// a JSON file) and served, flagged as stale, whenever the live fetch fails.
// The admin can also refresh the snapshot by pasting JSON copied from the API
// in a browser, which does pass the challenge.

const thmSnapshotFile = "data/thm_snapshot.json"

// Page size accepted by /api/v2/public-profile/completed-rooms (larger limits 404).
const thmRoomsPageSize = 16

func thmRoomsPageURL(username string, page int) string {
	return fmt.Sprintf("https://tryhackme.com/api/v2/public-profile/completed-rooms?username=%s&limit=%d&page=%d",
		username, thmRoomsPageSize, page)
}

type THMSnapshot struct {
	ID          string `json:"id" bson:"id"`
	PayloadJSON string `json:"payloadJson" bson:"payloadJson"`
	Source      string `json:"source" bson:"source"`
	UpdatedAt   string `json:"updatedAt" bson:"updatedAt"`
}

type THMSnapshotRequest struct {
	Profile json.RawMessage `json:"profile"`
	Skills  json.RawMessage `json:"skills"`
	Rooms   json.RawMessage `json:"rooms"`
}

func (a *App) loadTHMSnapshot() (*THMSnapshot, error) {
	if a.mongoStore != nil {
		snap, err := a.mongoStore.LoadTHMSnapshot()
		if err != nil || snap != nil {
			return snap, err
		}
		// Empty collection: fall through to a committed JSON seed, if any.
	}
	b, err := os.ReadFile(thmSnapshotFile)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var snap THMSnapshot
	if err := json.Unmarshal(b, &snap); err != nil {
		return nil, err
	}
	if strings.TrimSpace(snap.PayloadJSON) == "" {
		return nil, nil
	}
	return &snap, nil
}

func (a *App) saveTHMSnapshot(payload map[string]any, source string) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	snap := THMSnapshot{
		ID:          "current",
		PayloadJSON: string(body),
		Source:      source,
		UpdatedAt:   time.Now().UTC().Format(time.RFC3339),
	}
	b, err := json.MarshalIndent(snap, "", "  ")
	if err != nil {
		return err
	}
	// Only admin-pasted snapshots are worth a commit; live refreshes are not.
	if source == "manual" {
		a.backup(thmSnapshotFile, b, "Update TryHackMe snapshot")
	}
	if a.mongoStore != nil {
		return a.mongoStore.UpsertTHMSnapshot(snap)
	}
	return os.WriteFile(thmSnapshotFile, b, 0o644)
}

func (snap *THMSnapshot) payload() map[string]any {
	if snap == nil {
		return nil
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(snap.PayloadJSON), &payload); err != nil {
		return nil
	}
	return payload
}

// buildTHMPayload assembles the /api/tryhackme data section from raw endpoint
// results; it is shared by the live fetch and the manual admin sync.
func (a *App) buildTHMPayload(profileData any, skillsData any, rooms []string, roomLinks map[string]string, roomsCount int, roomsSource string) map[string]any {
	profileRooms := extractTHMRoomNames(profileData)
	roomLinks = mergeRoomLinks(roomLinks, extractTHMRoomLinks(profileData))
	profileRoomsCount, _ := extractTHMRoomCount(profileData)
	completedRooms := mergeUniqueStrings(rooms, profileRooms)
	if profileRoomsCount > roomsCount {
		roomsCount = profileRoomsCount
	}
	if roomsCount < len(completedRooms) {
		roomsCount = len(completedRooms)
	}
	return map[string]any{
		"publicProfile": profileData,
		"skillsResponse": map[string]any{
			"role":    a.thmSkillsRole,
			"segment": a.thmSkillsSegment,
			"data":    skillsData,
		},
		"skillsMatrix":         normalizeTHMSkills(skillsData),
		"completedRooms":       completedRooms,
		"completedRoomLinks":   roomLinks, // lower-cased room name -> tryhackme.com/room/<code>
		"completedRoomsCount":  roomsCount,
		"completedRoomsSource": roomsSource,
	}
}

// shortTHMError keeps error strings readable: the Vercel challenge page is a
// full HTML document, which is useless in the UI.
func shortTHMError(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	if strings.Contains(msg, "Vercel Security Checkpoint") || strings.Contains(msg, "status 429") {
		return "TryHackMe is blocking server-side requests (Vercel bot challenge, HTTP 429)"
	}
	if idx := strings.Index(msg, "<!DOCTYPE"); idx > 0 {
		msg = strings.TrimSpace(msg[:idx]) + " (HTML response)"
	}
	if len(msg) > 220 {
		msg = msg[:220] + "…"
	}
	return msg
}

// handleAdminTHMSnapshot accepts raw JSON copied from the TryHackMe API in a
// browser and rebuilds the snapshot from it.
func (a *App) handleAdminTHMSnapshot(w http.ResponseWriter, r *http.Request) {
	if !a.isAuthorizedAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case http.MethodGet:
		snap, err := a.loadTHMSnapshot()
		if err != nil {
			http.Error(w, "failed to load snapshot", http.StatusInternalServerError)
			return
		}
		// ?export=1 returns the stored document itself, in the exact shape
		// read from data/thm_snapshot.json, so it can be committed as a seed
		// that survives redeploys even without MongoDB.
		if r.URL.Query().Get("export") != "" {
			if snap == nil {
				http.Error(w, "no snapshot stored", http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Disposition", `attachment; filename="thm_snapshot.json"`)
			respondJSON(w, snap)
			return
		}
		respondJSON(w, a.thmSnapshotMeta(snap))
		return
	case http.MethodPost:
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var in THMSnapshotRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<20)).Decode(&in); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	decode := func(raw json.RawMessage, label string) (any, error) {
		if len(raw) == 0 || string(raw) == "null" || strings.TrimSpace(string(raw)) == `""` {
			return nil, nil
		}
		var v any
		if err := json.Unmarshal(raw, &v); err != nil {
			return nil, fmt.Errorf("%s is not valid JSON", label)
		}
		// Textareas post strings; accept JSON text inside them too.
		if s, ok := v.(string); ok {
			s = strings.TrimSpace(s)
			if s == "" {
				return nil, nil
			}
			inner, err := parseJSONDocuments(s)
			if err != nil {
				return nil, fmt.Errorf("%s is not valid JSON", label)
			}
			return inner, nil
		}
		return v, nil
	}

	profileData, err := decode(in.Profile, "profile")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	skillsData, err := decode(in.Skills, "skills")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	roomsData, err := decode(in.Rooms, "rooms")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Fill anything left blank from the previous snapshot so a partial paste
	// (for example only a fresh profile) does not wipe the rest.
	previous, _ := a.loadTHMSnapshot()
	prevPayload := previous.payload()
	if profileData == nil && prevPayload != nil {
		profileData = prevPayload["publicProfile"]
	}
	if skillsData == nil && prevPayload != nil {
		if sr, ok := prevPayload["skillsResponse"].(map[string]any); ok {
			skillsData = sr["data"]
		}
	}
	rooms := extractTHMRoomNames(roomsData)
	roomLinks := extractTHMRoomLinks(roomsData)
	roomsCount, _ := extractTHMRoomCount(roomsData)
	roomsSource := "manual-sync"
	if roomsData == nil && prevPayload != nil {
		rooms = toStringSlice(prevPayload["completedRooms"])
		roomLinks = toStringMap(prevPayload["completedRoomLinks"])
		if n, ok := asFloat64(prevPayload["completedRoomsCount"]); ok {
			roomsCount = int(n + 0.5)
		}
		if s, ok := prevPayload["completedRoomsSource"].(string); ok && s != "" {
			roomsSource = s
		}
	}

	if profileData == nil {
		http.Error(w, "profile JSON is required (no previous snapshot to fall back on)", http.StatusBadRequest)
		return
	}

	payload := a.buildTHMPayload(profileData, skillsData, rooms, roomLinks, roomsCount, roomsSource)
	if err := a.saveTHMSnapshot(payload, "manual"); err != nil {
		http.Error(w, "failed to save snapshot", http.StatusInternalServerError)
		return
	}

	a.invalidateTHMCache()

	snap, _ := a.loadTHMSnapshot()
	meta := a.thmSnapshotMeta(snap)
	meta["status"] = "saved"
	meta["skillsParsed"] = len(normalizeTHMSkills(skillsData))
	meta["roomsParsed"] = len(payload["completedRooms"].([]string))
	respondJSON(w, meta)
}

func (a *App) thmSnapshotMeta(snap *THMSnapshot) map[string]any {
	storage := "json-file (lost on redeploy — set MONGODB_URI or GIT_BACKUP_REPO)"
	if a.mongoStore != nil {
		storage = "mongodb"
	} else if a.gitBackup != nil {
		storage = "json-file + git backup"
	}
	meta := map[string]any{
		"hasSnapshot": snap != nil,
		"storage":     storage,
		"gitBackup":   a.gitBackupStatus(),
		"username":    a.thmUser,
		"endpoints": map[string]string{
			"profile": "https://tryhackme.com/api/v2/public-profile?username=" + a.thmUser,
			"skills": fmt.Sprintf("https://tryhackme.com/api/v2/users/skills?role=%s&segment=%s",
				a.thmSkillsRole, a.thmSkillsSegment),
			"rooms": thmRoomsPageURL(a.thmUser, 1),
		},
		"profilePage": "https://tryhackme.com/p/" + a.thmUser + "?tab=completed-rooms",
	}
	roomsCount := 0
	if snap != nil {
		meta["source"] = snap.Source
		meta["updatedAt"] = snap.UpdatedAt
		if p := snap.payload(); p != nil {
			meta["skillsTracked"] = len(toAnySlice(p["skillsMatrix"]))
			meta["roomsStored"] = len(toStringSlice(p["completedRooms"]))
			if n, ok := asFloat64(p["completedRoomsCount"]); ok {
				roomsCount = int(n + 0.5)
			}
		}
	}
	// TryHackMe serves completed rooms 16 per page; one link per page so the
	// admin can paste them all into the rooms box.
	pages := (roomsCount + thmRoomsPageSize - 1) / thmRoomsPageSize
	if pages < 4 {
		pages = 4
	}
	if pages > 25 {
		pages = 25
	}
	roomsPages := make([]string, 0, pages)
	for i := 1; i <= pages; i++ {
		roomsPages = append(roomsPages, thmRoomsPageURL(a.thmUser, i))
	}
	meta["roomsPages"] = roomsPages
	return meta
}

// parseJSONDocuments accepts one JSON value, or several pasted back to back
// (for example multiple pages of a paginated endpoint), which are returned as
// an array so the extractors walk all of them.
func parseJSONDocuments(text string) (any, error) {
	dec := json.NewDecoder(strings.NewReader(text))
	var docs []any
	for {
		var v any
		if err := dec.Decode(&v); err != nil {
			if err == io.EOF {
				break
			}
			return nil, err
		}
		docs = append(docs, v)
	}
	switch len(docs) {
	case 0:
		return nil, nil
	case 1:
		return docs[0], nil
	}
	return docs, nil
}

func toStringSlice(v any) []string {
	var out []string
	for _, item := range toAnySlice(v) {
		if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
			out = append(out, s)
		}
	}
	return out
}

func toAnySlice(v any) []any {
	switch t := v.(type) {
	case []any:
		return t
	case []string:
		out := make([]any, 0, len(t))
		for _, s := range t {
			out = append(out, s)
		}
		return out
	}
	return nil
}

func (m *MongoStore) LoadTHMSnapshot() (*THMSnapshot, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	var snap THMSnapshot
	err := m.thmSnapshot.FindOne(ctx, bson.M{"id": "current"}).Decode(&snap)
	if err != nil {
		if strings.Contains(err.Error(), "no documents") {
			return nil, nil
		}
		return nil, err
	}
	if strings.TrimSpace(snap.PayloadJSON) == "" {
		return nil, nil
	}
	return &snap, nil
}

func (m *MongoStore) UpsertTHMSnapshot(snap THMSnapshot) error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_, err := m.thmSnapshot.UpdateOne(
		ctx,
		bson.M{"id": snap.ID},
		bson.M{"$set": snap},
		options.Update().SetUpsert(true),
	)
	return err
}
