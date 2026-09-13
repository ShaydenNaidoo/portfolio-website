package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Skill categories shown in the matrix/radar are admin-configurable. Values
// come from the TryHackMe skills endpoint when a category name matches, and
// from an optional base value plus private-room boosts otherwise.

const thmSkillCategoriesFile = "data/thm_skill_categories.json"

var thmDefaultSkillCategories = []THMSkillCategory{
	{Name: "Security Operations"},
	{Name: "Incident Response"},
	{Name: "Malware Analysis"},
	{Name: "Penetration Testing"},
	{Name: "Exploitation"},
	{Name: "Red Teaming"},
}

type THMSkillCategory struct {
	Name      string  `json:"name" bson:"name"`
	BaseValue float64 `json:"baseValue" bson:"baseValue"`
	Order     int     `json:"order" bson:"order"`
}

type THMSkillCategoryRequest struct {
	Name      string  `json:"name"`
	BaseValue float64 `json:"baseValue"`
}

func (a *App) loadTHMSkillCategories() ([]THMSkillCategory, error) {
	var categories []THMSkillCategory
	var err error
	if a.mongoStore != nil {
		categories, err = a.mongoStore.LoadTHMSkillCategories()
	} else {
		var b []byte
		b, err = os.ReadFile(thmSkillCategoriesFile)
		if err == nil {
			err = json.Unmarshal(b, &categories)
		} else if os.IsNotExist(err) {
			err = nil
		}
	}
	if err != nil {
		return nil, err
	}
	if len(categories) == 0 {
		// Nothing configured yet: start from the TryHackMe defaults.
		categories = append([]THMSkillCategory(nil), thmDefaultSkillCategories...)
		for i := range categories {
			categories[i].Order = i
		}
	}
	return categories, nil
}

func (a *App) saveTHMSkillCategories(categories []THMSkillCategory) error {
	for i := range categories {
		categories[i].Order = i
	}
	if a.mongoStore != nil {
		return a.mongoStore.ReplaceTHMSkillCategories(categories)
	}
	b, err := json.MarshalIndent(categories, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(thmSkillCategoriesFile, b, 0o644)
}

func thmSkillCategoryNames(categories []THMSkillCategory) []string {
	names := make([]string, 0, len(categories))
	for _, c := range categories {
		names = append(names, c.Name)
	}
	return names
}

// canonicalTHMSkillCategory matches a name against the configured list,
// case-insensitively, returning the stored spelling.
func canonicalTHMSkillCategory(categories []THMSkillCategory, name string) string {
	needle := strings.ToLower(strings.TrimSpace(name))
	for _, category := range categories {
		if strings.ToLower(category.Name) == needle {
			return category.Name
		}
	}
	return ""
}

// GET    /api/admin/tryhackme/skills         -> list
// POST   /api/admin/tryhackme/skills         -> add or update {name, baseValue}
// DELETE /api/admin/tryhackme/skills/<name>  -> remove
func (a *App) handleAdminTHMSkillCategories(w http.ResponseWriter, r *http.Request) {
	if !a.isAuthorizedAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	categories, err := a.loadTHMSkillCategories()
	if err != nil {
		http.Error(w, "failed to load skill categories", http.StatusInternalServerError)
		return
	}

	switch r.Method {
	case http.MethodGet:
		respondJSON(w, map[string]any{"categories": categories})

	case http.MethodPost:
		var in THMSkillCategoryRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&in); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		name := strings.Join(strings.Fields(in.Name), " ")
		if name == "" {
			http.Error(w, "skill name is required", http.StatusBadRequest)
			return
		}
		if utf8Len(name) > 40 {
			http.Error(w, "skill name must be 40 characters or fewer", http.StatusBadRequest)
			return
		}
		if in.BaseValue < 0 || in.BaseValue > 100 {
			http.Error(w, "base value must be between 0 and 100", http.StatusBadRequest)
			return
		}
		status := "added"
		if existing := canonicalTHMSkillCategory(categories, name); existing != "" {
			for i := range categories {
				if categories[i].Name == existing {
					categories[i].BaseValue = in.BaseValue
				}
			}
			status = "updated"
		} else {
			if len(categories) >= 12 {
				http.Error(w, "keep it to 12 skills or fewer so the radar stays readable", http.StatusBadRequest)
				return
			}
			categories = append(categories, THMSkillCategory{Name: name, BaseValue: in.BaseValue})
		}
		if err := a.saveTHMSkillCategories(categories); err != nil {
			http.Error(w, "failed to save skill categories", http.StatusInternalServerError)
			return
		}
		a.invalidateTHMCache()
		respondJSON(w, map[string]any{"status": status, "categories": categories})

	case http.MethodDelete:
		raw := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/tryhackme/skills/"), "/")
		name := canonicalTHMSkillCategory(categories, raw)
		if name == "" {
			http.Error(w, "unknown skill category", http.StatusNotFound)
			return
		}
		if len(categories) <= 1 {
			http.Error(w, "keep at least one skill in the matrix", http.StatusBadRequest)
			return
		}
		kept := categories[:0]
		for _, c := range categories {
			if c.Name != name {
				kept = append(kept, c)
			}
		}
		if err := a.saveTHMSkillCategories(kept); err != nil {
			http.Error(w, "failed to save skill categories", http.StatusInternalServerError)
			return
		}
		a.invalidateTHMCache()
		respondJSON(w, map[string]any{"status": "deleted", "categories": kept})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (m *MongoStore) LoadTHMSkillCategories() ([]THMSkillCategory, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	cursor, err := m.thmSkillCategories.Find(ctx, bson.D{}, options.Find().SetSort(bson.D{{Key: "order", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var categories []THMSkillCategory
	if err := cursor.All(ctx, &categories); err != nil {
		return nil, err
	}
	return categories, nil
}

// ReplaceTHMSkillCategories rewrites the whole (small) list so ordering and
// removals stay simple.
func (m *MongoStore) ReplaceTHMSkillCategories(categories []THMSkillCategory) error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if _, err := m.thmSkillCategories.DeleteMany(ctx, bson.D{}); err != nil {
		return err
	}
	if len(categories) == 0 {
		return nil
	}
	docs := make([]any, 0, len(categories))
	for _, c := range categories {
		docs = append(docs, c)
	}
	if _, err := m.thmSkillCategories.InsertMany(ctx, docs); err != nil {
		return fmt.Errorf("insert skill categories: %w", err)
	}
	return nil
}
