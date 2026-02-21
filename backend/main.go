package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
)

type Repo struct {
	ID          int64    `json:"id"`
	Name        string   `json:"name"`
	FullName    string   `json:"fullName"`
	URL         string   `json:"url"`
	Description string   `json:"description"`
	Language    string   `json:"language"`
	Topics      []string `json:"topics"`
	Readme      string   `json:"readme"`
	PushedAt    string   `json:"pushedAt"`
	Stars       int      `json:"stars"`
	Forks       int      `json:"forks"`
	Pinned      bool     `json:"pinned"`
	PinOrder    int      `json:"pinOrder"`
}

type Certification struct {
	Name   string `json:"name"`
	Issuer string `json:"issuer"`
	Date   string `json:"date"`
	URL    string `json:"url"`
}

type Experience struct {
	Role        string   `json:"role"`
	Company     string   `json:"company"`
	DateRange   string   `json:"dateRange"`
	Description []string `json:"description"`
}

type SiteData struct {
	DisplayName    string          `json:"displayName"`
	Headline       string          `json:"headline"`
	Bio            string          `json:"bio"`
	CVURL          string          `json:"cvUrl"`
	Languages      []string        `json:"languages"`
	Certifications []Certification `json:"certifications"`
	Experience     []Experience    `json:"experience"`
}

type RepoOverride struct {
	Description string `json:"description"`
	Readme      string `json:"readme"`
	Pinned      bool   `json:"pinned"`
	PinOrder    int    `json:"pinOrder"`
}

type THMSkill struct {
	Name  string  `json:"name"`
	Value float64 `json:"value"`
}

type App struct {
	mu              sync.RWMutex
	repos           []Repo
	overrides       map[string]RepoOverride
	siteData        SiteData
	githubUser      string
	githubToken     string
	thmUser         string
	thmSession      string
	thmCookie       string
	thmSkillsRole   string
	thmSkillsSegment string
}

func main() {
	role := os.Getenv("THM_SKILLS_ROLE")
	if role == "" {
		role = "Foundational"
	}
	segment := os.Getenv("THM_SKILLS_SEGMENT")
	if segment == "" {
		segment = "entry"
	}
	app := &App{
		githubUser:      os.Getenv("GITHUB_USERNAME"),
		githubToken:     os.Getenv("GITHUB_TOKEN"),
		thmUser:         os.Getenv("THM_USERNAME"),
		thmSession:      os.Getenv("THM_SESSION"),
		thmCookie:       os.Getenv("THM_COOKIE"),
		thmSkillsRole:   role,
		thmSkillsSegment: segment,
		overrides:        map[string]RepoOverride{},
	}
	if app.githubUser == "" {
		app.githubUser = "octocat"
	}
	app.loadSiteData()
	app.loadOverrides()
	_ = app.refreshRepos()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/profile", app.handleProfile)
	mux.HandleFunc("/api/repos", app.handleRepos)
	mux.HandleFunc("/api/admin/repo/", app.handleRepoUpdate)
	mux.HandleFunc("/api/admin/refresh", app.handleRefresh)
	mux.HandleFunc("/api/tryhackme", app.handleTHM)
	mux.HandleFunc("/webhooks/github", app.handleGitHubWebhook)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	fmt.Printf("Backend running on :%s\n", port)
	if err := http.ListenAndServe(":"+port, withCORS(mux)); err != nil {
		panic(err)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *App) loadSiteData() {
	b, err := os.ReadFile("data/site_data.json")
	if err != nil {
		a.siteData = SiteData{DisplayName: "Your Name", Headline: "Full-Stack Engineer", Bio: "I build secure, production-ready applications.", CVURL: "", Languages: []string{"Go", "TypeScript", "Python"}}
		return
	}
	_ = json.Unmarshal(b, &a.siteData)
}

func (a *App) loadOverrides() {
	b, err := os.ReadFile("data/repo_overrides.json")
	if err != nil {
		return
	}
	_ = json.Unmarshal(b, &a.overrides)
}

func (a *App) saveOverrides() error {
	b, err := json.MarshalIndent(a.overrides, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile("data/repo_overrides.json", b, 0o644)
}

func (a *App) handleProfile(w http.ResponseWriter, _ *http.Request) { respondJSON(w, a.siteData) }

func (a *App) handleRepos(w http.ResponseWriter, _ *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	respondJSON(w, a.repos)
}

func (a *App) handleRefresh(w http.ResponseWriter, _ *http.Request) {
	if err := a.refreshRepos(); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	respondJSON(w, map[string]string{"status": "ok"})
}

func (a *App) handleRepoUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	name := strings.TrimPrefix(r.URL.Path, "/api/admin/repo/")
	if name == "" {
		http.Error(w, "repo name required", http.StatusBadRequest)
		return
	}
	var in RepoOverride
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	a.mu.Lock()
	a.overrides[name] = in
	_ = a.saveOverrides()
	a.mu.Unlock()
	_ = a.refreshRepos()
	respondJSON(w, map[string]string{"status": "updated"})
}

func (a *App) handleGitHubWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	event := r.Header.Get("X-GitHub-Event")
	if event == "push" || event == "repository" || event == "create" {
		_ = a.refreshRepos()
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) refreshRepos() error {
	url := fmt.Sprintf("https://api.github.com/users/%s/repos?sort=updated&per_page=100", a.githubUser)
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	if a.githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+a.githubToken)
	}
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("github api failed: %s", string(body))
	}
	var raw []map[string]any
	if err = json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return err
	}
	out := make([]Repo, 0, len(raw))
	for _, r := range raw {
		name := asString(r["name"])
		ov := a.overrides[name]
		repo := Repo{ID: asInt64(r["id"]), Name: name, FullName: asString(r["full_name"]), URL: asString(r["html_url"]), Description: asString(r["description"]), Language: asString(r["language"]), PushedAt: asString(r["pushed_at"]), Stars: int(asInt64(r["stargazers_count"])), Forks: int(asInt64(r["forks_count"])), Topics: asStringSlice(r["topics"]), Pinned: ov.Pinned, PinOrder: ov.PinOrder}
		if ov.Description != "" {
			repo.Description = ov.Description
		}
		if ov.Readme != "" {
			repo.Readme = ov.Readme
		}
		out = append(out, repo)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Pinned != out[j].Pinned {
			return out[i].Pinned
		}
		if out[i].Pinned && out[j].Pinned && out[i].PinOrder != out[j].PinOrder {
			return out[i].PinOrder < out[j].PinOrder
		}
		return out[i].PushedAt > out[j].PushedAt
	})
	a.mu.Lock()
	a.repos = out
	a.mu.Unlock()
	return nil
}

func (a *App) handleTHM(w http.ResponseWriter, _ *http.Request) {
	if a.thmUser == "" {
		respondJSON(w, map[string]any{"enabled": false, "message": "Set THM_USERNAME to enable TryHackMe stats."})
		return
	}
	client := &http.Client{Timeout: 20 * time.Second}
	profileURL := "https://tryhackme.com/api/v2/public-profile?username=" + url.QueryEscape(a.thmUser)
	profileData, profileErr := a.fetchTHMJSON(client, profileURL)

	skillsURL := fmt.Sprintf(
		"https://tryhackme.com/api/v2/users/skills?role=%s&segment=%s",
		url.QueryEscape(a.thmSkillsRole),
		url.QueryEscape(a.thmSkillsSegment),
	)
	skillsData, skillsErr := a.fetchTHMJSON(client, skillsURL)
	normalizedSkills := normalizeTHMSkills(skillsData)

	if profileErr != nil && skillsErr != nil {
		respondJSON(w, map[string]any{"enabled": true, "error": "Unable to fetch TryHackMe profile and skills data", "profileError": profileErr.Error(), "skillsError": skillsErr.Error()})
		return
	}

	payload := map[string]any{
		"publicProfile": profileData,
		"skillsResponse": map[string]any{
			"role":    a.thmSkillsRole,
			"segment": a.thmSkillsSegment,
			"data":    skillsData,
		},
		"skillsMatrix": normalizedSkills,
	}
	if profileErr != nil {
		payload["profileError"] = profileErr.Error()
	}
	if skillsErr != nil {
		payload["skillsError"] = skillsErr.Error()
	} else if len(normalizedSkills) == 0 {
		payload["skillsError"] = "Skills endpoint returned no parsable matrix values. Ensure THM_COOKIE/THM_SESSION includes a valid connect.sid session."
	}

	respondJSON(w, map[string]any{"enabled": true, "data": payload})
}

func (a *App) fetchTHMJSON(client *http.Client, endpoint string) (any, error) {
	req, _ := http.NewRequest(http.MethodGet, endpoint, nil)
	req.Header.Set("Accept", "application/json")
	if cookie := a.thmCookieHeader(); cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		msg := strings.TrimSpace(string(body))
		if msg == "" {
			msg = http.StatusText(resp.StatusCode)
		}
		return nil, fmt.Errorf("status %d: %s", resp.StatusCode, msg)
	}
	var v any
	if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
		return nil, err
	}
	return v, nil
}

func (a *App) thmCookieHeader() string {
	cookie := strings.TrimSpace(a.thmCookie)
	if cookie != "" {
		return cookie
	}
	session := strings.TrimSpace(a.thmSession)
	if session == "" {
		return ""
	}
	// Backward compatibility:
	// - THM_SESSION="<raw connect.sid value>"
	// - THM_SESSION="connect.sid=<...>; other=<...>"
	if strings.Contains(session, "=") {
		return session
	}
	return "connect.sid=" + session
}

func respondJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func asString(v any) string {
	s, _ := v.(string)
	return s
}
func asInt64(v any) int64 {
	switch t := v.(type) {
	case float64:
		return int64(t)
	case int64:
		return t
	case string:
		n, _ := strconv.ParseInt(t, 10, 64)
		return n
	default:
		return 0
	}
}
func asStringSlice(v any) []string {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	res := make([]string, 0, len(arr))
	for _, x := range arr {
		if s, ok := x.(string); ok {
			res = append(res, s)
		}
	}
	return res
}

func asFloat64(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case float32:
		return float64(t), true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case int32:
		return float64(t), true
	case string:
		n, err := strconv.ParseFloat(strings.TrimSpace(t), 64)
		if err != nil {
			return 0, false
		}
		return n, true
	default:
		return 0, false
	}
}

func pickFirstNumericField(m map[string]any, keys ...string) (float64, bool) {
	for _, key := range keys {
		if v, ok := m[key]; ok {
			if n, ok := asFloat64(v); ok {
				return n, true
			}
		}
	}
	return 0, false
}

func pickFirstStringField(m map[string]any, keys ...string) (string, bool) {
	for _, key := range keys {
		if v, ok := m[key]; ok {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				return strings.TrimSpace(s), true
			}
		}
	}
	return "", false
}

func pickDeepNumericField(v any, keys ...string) (float64, bool) {
	if v == nil {
		return 0, false
	}
	keySet := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		keySet[strings.ToLower(strings.TrimSpace(key))] = struct{}{}
	}
	candidates := []float64{}
	var walk func(any)
	walk = func(node any) {
		switch t := node.(type) {
		case map[string]any:
			for k, child := range t {
				if _, wanted := keySet[strings.ToLower(strings.TrimSpace(k))]; wanted {
					if n, ok := asFloat64(child); ok {
						candidates = append(candidates, n)
					}
				}
				walk(child)
			}
		case []any:
			for _, child := range t {
				walk(child)
			}
		}
	}
	walk(v)
	if len(candidates) == 0 {
		return 0, false
	}
	best := candidates[0]
	for i := 1; i < len(candidates); i++ {
		if candidates[i] > best {
			best = candidates[i]
		}
	}
	return best, true
}

func normalizeTHMSkills(raw any) []THMSkill {
	if raw == nil {
		return nil
	}
	out := collectTHMSkills(raw)
	if len(out) == 0 {
		return nil
	}
	return dedupeAndSortTHMSkills(out)
}

func collectTHMSkills(raw any) []THMSkill {
	var out []THMSkill
	queue := []any{raw}

	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]

		switch t := node.(type) {
		case map[string]any:
			if name, ok := pickFirstStringField(t, "name", "skill", "title", "category", "label", "dimension"); ok {
				if value, ok := pickFirstNumericField(t, "value", "score", "level", "progress", "percent", "percentage", "points", "xp"); ok {
					out = append(out, THMSkill{Name: humanizeSkillName(name), Value: value})
				} else if value, ok := pickDeepNumericField(t, "value", "score", "level", "progress", "percent", "percentage", "points", "xp", "completed"); ok {
					out = append(out, THMSkill{Name: humanizeSkillName(name), Value: value})
				}
			}
			for k, v := range t {
				if n, ok := asFloat64(v); ok && looksLikeSkillName(k) {
					out = append(out, THMSkill{Name: humanizeSkillName(k), Value: n})
					continue
				}
				if childMap, ok := v.(map[string]any); ok && looksLikeSkillName(k) {
					if n, ok := pickFirstNumericField(childMap, "value", "score", "level", "progress", "percent", "percentage", "points", "xp"); ok {
						out = append(out, THMSkill{Name: humanizeSkillName(k), Value: n})
						continue
					}
					if n, ok := pickDeepNumericField(childMap, "value", "score", "level", "progress", "percent", "percentage", "points", "xp", "completed"); ok {
						out = append(out, THMSkill{Name: humanizeSkillName(k), Value: n})
						continue
					}
				}
				if v != nil {
					queue = append(queue, v)
				}
			}

		case []any:
			for _, child := range t {
				queue = append(queue, child)
			}
		}
	}

	return out
}

func dedupeAndSortTHMSkills(in []THMSkill) []THMSkill {
	seen := map[string]THMSkill{}
	for _, skill := range in {
		name := strings.TrimSpace(skill.Name)
		if name == "" {
			continue
		}
		key := strings.ToLower(name)
		current, exists := seen[key]
		if !exists || skill.Value > current.Value {
			seen[key] = THMSkill{Name: name, Value: skill.Value}
		}
	}
	out := make([]THMSkill, 0, len(seen))
	for _, skill := range seen {
		out = append(out, skill)
	}
	sort.SliceStable(out, func(i, j int) bool {
		oi, okI := thmSkillOrder(out[i].Name)
		oj, okJ := thmSkillOrder(out[j].Name)
		if okI && okJ {
			return oi < oj
		}
		if okI {
			return true
		}
		if okJ {
			return false
		}
		return out[i].Name < out[j].Name
	})
	return out
}

func thmSkillOrder(name string) (int, bool) {
	n := strings.ToLower(strings.TrimSpace(name))
	order := map[string]int{
		"security operations": 1,
		"incident response":   2,
		"malware analysis":    3,
		"penetration testing": 4,
		"exploitation":        5,
		"red teaming":         6,
	}
	idx, ok := order[n]
	return idx, ok
}

func looksLikeSkillName(name string) bool {
	n := strings.ToLower(strings.TrimSpace(name))
	if n == "" {
		return false
	}
	if strings.Contains(n, "security") || strings.Contains(n, "incident") || strings.Contains(n, "malware") ||
		strings.Contains(n, "penetration") || strings.Contains(n, "exploit") || strings.Contains(n, "red team") ||
		strings.Contains(n, "forensic") || strings.Contains(n, "web") || strings.Contains(n, "crypto") {
		return true
	}
	deny := map[string]struct{}{
		"data": {}, "meta": {}, "role": {}, "segment": {}, "id": {}, "name": {}, "title": {}, "value": {},
		"status": {}, "message": {}, "errors": {}, "createdat": {}, "updatedat": {}, "username": {},
	}
	if _, blocked := deny[n]; blocked {
		return false
	}
	return strings.Contains(n, "skill")
}

func humanizeSkillName(value string) string {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return ""
	}
	var b strings.Builder
	prevLowerOrDigit := false
	for _, r := range raw {
		if r == '_' || r == '-' {
			b.WriteRune(' ')
			prevLowerOrDigit = false
			continue
		}
		if unicode.IsUpper(r) && prevLowerOrDigit {
			b.WriteRune(' ')
		}
		b.WriteRune(r)
		prevLowerOrDigit = unicode.IsLower(r) || unicode.IsDigit(r)
	}
	parts := strings.Fields(strings.ToLower(b.String()))
	for i, part := range parts {
		if len(part) == 0 {
			continue
		}
		r := []rune(part)
		r[0] = unicode.ToUpper(r[0])
		parts[i] = string(r)
	}
	return strings.Join(parts, " ")
}
