package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Private rooms never appear on the public TryHackMe profile, so the admin can
// register them from a "share your achievement" link. Each one is merged into
// the completed-rooms list and count, and boosts the chosen skill categories
// in the matrix when /api/tryhackme is served.

const (
	thmManualRoomsFile     = "data/thm_manual_rooms.json"
	thmManualRoomBoostMin  = 1
	thmManualRoomBoostMax  = 25
	thmManualRoomBoostDflt = 5
)

var thmRoomCodePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,120}$`)

type THMManualRoom struct {
	Code    string   `json:"code" bson:"code"`
	Name    string   `json:"name" bson:"name"`
	URL     string   `json:"url" bson:"url"`
	Skills  []string `json:"skills" bson:"skills"`
	Boost   float64  `json:"boost" bson:"boost"`
	AddedAt string   `json:"addedAt" bson:"addedAt"`
}

type THMManualRoomRequest struct {
	URL    string   `json:"url"`
	Name   string   `json:"name"`
	Skills []string `json:"skills"`
	Boost  float64  `json:"boost"`
}

// parseTHMRoomLink accepts a share link, a room URL or a bare room code and
// returns the room code.
func parseTHMRoomLink(input string) (string, error) {
	raw := strings.TrimSpace(input)
	if raw == "" {
		return "", fmt.Errorf("room link is required")
	}
	code := raw
	if strings.Contains(raw, "/") || strings.Contains(raw, "?") {
		if !strings.Contains(raw, "://") {
			raw = "https://" + raw
		}
		u, err := url.Parse(raw)
		if err != nil {
			return "", fmt.Errorf("room link is not a valid URL")
		}
		parts := strings.Split(strings.Trim(u.Path, "/"), "/")
		code = ""
		for i, part := range parts {
			if (part == "room" || part == "jr") && i+1 < len(parts) {
				code = parts[i+1]
				break
			}
		}
		if code == "" && len(parts) > 0 {
			code = parts[len(parts)-1]
		}
	}
	code = strings.TrimSpace(code)
	if !thmRoomCodePattern.MatchString(code) {
		return "", fmt.Errorf("could not find a room code in that link")
	}
	return code, nil
}

// prettyTHMRoomName turns "MWR-CyberSec-Week-1-8w-9ypa" into "MWR CyberSec Week 1"
// by dropping the trailing random id segments TryHackMe appends to room codes.
func prettyTHMRoomName(code string) string {
	parts := strings.FieldsFunc(code, func(r rune) bool { return r == '-' || r == '_' })
	// Trailing short alphanumeric junk (e.g. "8w", "9ypa") is an id, not a word.
	for len(parts) > 1 {
		last := parts[len(parts)-1]
		hasDigit := strings.ContainsAny(last, "0123456789")
		hasLetter := strings.ContainsAny(strings.ToLower(last), "abcdefghijklmnopqrstuvwxyz")
		if len(last) <= 4 && hasDigit && hasLetter {
			parts = parts[:len(parts)-1]
			continue
		}
		break
	}
	return strings.Join(parts, " ")
}

func (a *App) loadTHMManualRooms() ([]THMManualRoom, error) {
	if a.mongoStore != nil {
		return a.mongoStore.LoadTHMManualRooms()
	}
	b, err := os.ReadFile(thmManualRoomsFile)
	if err != nil {
		if os.IsNotExist(err) {
			return []THMManualRoom{}, nil
		}
		return nil, err
	}
	var rooms []THMManualRoom
	if err := json.Unmarshal(b, &rooms); err != nil {
		return nil, err
	}
	if rooms == nil {
		rooms = []THMManualRoom{}
	}
	return rooms, nil
}

func (a *App) saveTHMManualRoomsFile(rooms []THMManualRoom) error {
	b, err := json.MarshalIndent(rooms, "", "  ")
	if err != nil {
		return err
	}
	a.backup(thmManualRoomsFile, b, "Update TryHackMe manual rooms")
	return os.WriteFile(thmManualRoomsFile, b, 0o644)
}

// applyTHMCustomization rebuilds the skills matrix from the configured
// categories (TryHackMe value when the name matches, else the base value, plus
// private-room boosts) and folds registered private rooms into the completed
// list and count. It runs at response time so the stored snapshot stays
// untouched and the operation is idempotent.
func (a *App) applyTHMCustomization(payload map[string]any) {
	categories, err := a.loadTHMSkillCategories()
	if err != nil {
		categories = append([]THMSkillCategory(nil), thmDefaultSkillCategories...)
	}
	rooms, err := a.loadTHMManualRooms()
	if err != nil {
		rooms = nil
	}

	// Values reported by TryHackMe, keyed by lower-case name.
	reported := map[string]float64{}
	switch m := payload["skillsMatrix"].(type) {
	case []THMSkill:
		for _, skill := range m {
			reported[strings.ToLower(skill.Name)] = skill.Value
		}
	case []any:
		for _, item := range m {
			if obj, ok := item.(map[string]any); ok {
				name, _ := obj["name"].(string)
				value, _ := asFloat64(obj["value"])
				if name != "" {
					reported[strings.ToLower(name)] = value
				}
			}
		}
	}

	matrix := make([]THMSkill, 0, len(categories))
	index := map[string]int{}
	for i, category := range categories {
		key := strings.ToLower(category.Name)
		value := category.BaseValue
		if v, ok := reported[key]; ok && v > value {
			value = v
		}
		matrix = append(matrix, THMSkill{Name: category.Name, Value: value})
		index[key] = i
	}
	for _, room := range rooms {
		for _, skill := range room.Skills {
			if i, ok := index[strings.ToLower(skill)]; ok {
				matrix[i].Value += room.Boost
			}
		}
	}
	for i := range matrix {
		if matrix[i].Value > 100 {
			matrix[i].Value = 100
		}
		if matrix[i].Value < 0 {
			matrix[i].Value = 0
		}
	}
	payload["skillsMatrix"] = matrix
	payload["skillCategories"] = thmSkillCategoryNames(categories)

	if len(rooms) == 0 {
		payload["manualRooms"] = []THMManualRoom{}
		return
	}
	existing := toStringSlice(payload["completedRooms"])
	names := make([]string, 0, len(rooms))
	for _, room := range rooms {
		names = append(names, room.Name)
	}
	merged := mergeUniqueStrings(existing, names)
	added := len(merged) - len(existing)
	payload["completedRooms"] = merged

	count := 0
	if n, ok := asFloat64(payload["completedRoomsCount"]); ok {
		count = int(n + 0.5)
	}
	count += added
	if count < len(merged) {
		count = len(merged)
	}
	payload["completedRoomsCount"] = count
	payload["manualRooms"] = rooms
}

func (a *App) invalidateTHMCache() {
	a.mu.Lock()
	a.thmCacheBody = nil
	a.thmCacheExpiresAt = time.Time{}
	a.mu.Unlock()
}

// GET  /api/admin/tryhackme/rooms          -> list
// POST /api/admin/tryhackme/rooms          -> add / update one
// DELETE /api/admin/tryhackme/rooms/<code> -> remove
func (a *App) handleAdminTHMManualRooms(w http.ResponseWriter, r *http.Request) {
	if !a.isAuthorizedAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case http.MethodGet:
		rooms, err := a.loadTHMManualRooms()
		if err != nil {
			http.Error(w, "failed to load rooms", http.StatusInternalServerError)
			return
		}
		categories, _ := a.loadTHMSkillCategories()
		respondJSON(w, map[string]any{"rooms": rooms, "categories": thmSkillCategoryNames(categories)})

	case http.MethodPost:
		var in THMManualRoomRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&in); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		code, err := parseTHMRoomLink(in.URL)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		name := strings.TrimSpace(in.Name)
		if name == "" {
			name = prettyTHMRoomName(code)
		}
		if utf8Len(name) > 120 {
			http.Error(w, "room name must be 120 characters or fewer", http.StatusBadRequest)
			return
		}
		categories, _ := a.loadTHMSkillCategories()
		var skills []string
		seen := map[string]bool{}
		for _, raw := range in.Skills {
			category := canonicalTHMSkillCategory(categories, raw)
			if category == "" {
				http.Error(w, fmt.Sprintf("unknown skill category %q", raw), http.StatusBadRequest)
				return
			}
			if !seen[category] {
				seen[category] = true
				skills = append(skills, category)
			}
		}
		if skills == nil {
			skills = []string{}
		}
		boost := in.Boost
		if boost == 0 {
			boost = thmManualRoomBoostDflt
		}
		if boost < thmManualRoomBoostMin || boost > thmManualRoomBoostMax {
			http.Error(w, fmt.Sprintf("boost must be between %d and %d", thmManualRoomBoostMin, thmManualRoomBoostMax), http.StatusBadRequest)
			return
		}
		room := THMManualRoom{
			Code:    code,
			Name:    name,
			URL:     "https://tryhackme.com/room/" + code,
			Skills:  skills,
			Boost:   boost,
			AddedAt: time.Now().UTC().Format(time.RFC3339),
		}

		rooms, err := a.loadTHMManualRooms()
		if err != nil {
			http.Error(w, "failed to load rooms", http.StatusInternalServerError)
			return
		}
		replaced := false
		for i := range rooms {
			if strings.EqualFold(rooms[i].Code, code) {
				room.AddedAt = rooms[i].AddedAt
				rooms[i] = room
				replaced = true
				break
			}
		}
		if !replaced {
			rooms = append(rooms, room)
		}
		sort.SliceStable(rooms, func(i, j int) bool { return rooms[i].AddedAt < rooms[j].AddedAt })

		if a.mongoStore != nil {
			err = a.mongoStore.UpsertTHMManualRoom(room)
		} else {
			err = a.saveTHMManualRoomsFile(rooms)
		}
		if err != nil {
			http.Error(w, "failed to save room", http.StatusInternalServerError)
			return
		}
		a.invalidateTHMCache()
		respondJSON(w, map[string]any{"status": map[bool]string{true: "updated", false: "added"}[replaced], "room": room, "rooms": rooms})

	case http.MethodDelete:
		code := strings.TrimPrefix(r.URL.Path, "/api/admin/tryhackme/rooms/")
		code = strings.Trim(code, "/")
		if code == "" || !thmRoomCodePattern.MatchString(code) {
			http.Error(w, "room code is required", http.StatusBadRequest)
			return
		}
		rooms, err := a.loadTHMManualRooms()
		if err != nil {
			http.Error(w, "failed to load rooms", http.StatusInternalServerError)
			return
		}
		kept := rooms[:0]
		for _, room := range rooms {
			if !strings.EqualFold(room.Code, code) {
				kept = append(kept, room)
			}
		}
		if a.mongoStore != nil {
			err = a.mongoStore.DeleteTHMManualRoom(code)
		} else {
			err = a.saveTHMManualRoomsFile(kept)
		}
		if err != nil {
			http.Error(w, "failed to delete room", http.StatusInternalServerError)
			return
		}
		a.invalidateTHMCache()
		respondJSON(w, map[string]any{"status": "deleted", "rooms": kept})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (m *MongoStore) LoadTHMManualRooms() ([]THMManualRoom, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	cursor, err := m.thmManualRooms.Find(ctx, bson.D{}, options.Find().SetSort(bson.D{{Key: "addedAt", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var rooms []THMManualRoom
	if err := cursor.All(ctx, &rooms); err != nil {
		return nil, err
	}
	if rooms == nil {
		rooms = []THMManualRoom{}
	}
	return rooms, nil
}

func (m *MongoStore) UpsertTHMManualRoom(room THMManualRoom) error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_, err := m.thmManualRooms.UpdateOne(ctx, bson.M{"code": room.Code}, bson.M{"$set": room}, options.Update().SetUpsert(true))
	return err
}

func (m *MongoStore) DeleteTHMManualRoom(code string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_, err := m.thmManualRooms.DeleteOne(ctx, bson.M{"code": code})
	return err
}
