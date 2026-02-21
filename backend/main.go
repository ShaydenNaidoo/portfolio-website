package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
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

type App struct {
	mu          sync.RWMutex
	repos       []Repo
	overrides   map[string]RepoOverride
	siteData    SiteData
	githubUser  string
	githubToken string
	thmUser     string
	thmSession  string
}

func main() {
	app := &App{githubUser: os.Getenv("GITHUB_USERNAME"), githubToken: os.Getenv("GITHUB_TOKEN"), thmUser: os.Getenv("THM_USERNAME"), thmSession: os.Getenv("THM_SESSION"), overrides: map[string]RepoOverride{}}
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
	url := "https://tryhackme.com/api/v2/public-profile?username=" + a.thmUser
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	if a.thmSession != "" {
		req.Header.Set("Cookie", "connect.sid="+a.thmSession)
	}
	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		respondJSON(w, map[string]any{"enabled": true, "error": err.Error()})
		return
	}
	defer resp.Body.Close()
	var v any
	if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
		respondJSON(w, map[string]any{"enabled": true, "error": "Unable to parse TryHackMe response"})
		return
	}
	respondJSON(w, map[string]any{"enabled": true, "data": v})
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
