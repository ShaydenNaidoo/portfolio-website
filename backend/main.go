package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
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

const (
	repoCacheFile = "data/repos_cache.json"
	thmCacheTTL   = 10 * time.Minute
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

type BlogPost struct {
	ID        string `json:"id,omitempty" bson:"id,omitempty"`
	Title     string `json:"title,omitempty" bson:"title,omitempty"`
	Date      string `json:"date,omitempty" bson:"date,omitempty"`
	Excerpt   string `json:"excerpt,omitempty" bson:"excerpt,omitempty"`
	URL       string `json:"url,omitempty" bson:"url,omitempty"`
	Content   string `json:"content,omitempty" bson:"content,omitempty"`
	ImageData string `json:"imageData,omitempty" bson:"imageData,omitempty"`
	CreatedAt string `json:"createdAt,omitempty" bson:"createdAt,omitempty"`
}

type SiteData struct {
	DisplayName    string          `json:"displayName"`
	Headline       string          `json:"headline"`
	Bio            string          `json:"bio"`
	CVURL          string          `json:"cvUrl"`
	LinkedInURL    string          `json:"linkedinUrl"`
	Languages      []string        `json:"languages"`
	Certifications []Certification `json:"certifications"`
	Experience     []Experience    `json:"experience"`
	BlogPosts      []BlogPost      `json:"blogPosts"`
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

type AdminLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type AdminLoginResponse struct {
	Token     string `json:"token"`
	Username  string `json:"username"`
	ExpiresAt string `json:"expiresAt"`
}

type AdminBlogCreateRequest struct {
	Content   string `json:"content"`
	ImageData string `json:"imageData"`
}

// AdminBlogUpdateRequest edits an existing post. An empty imageData keeps the
// current image; clearImage removes it.
type AdminBlogUpdateRequest struct {
	Content    string `json:"content"`
	ImageData  string `json:"imageData"`
	ClearImage bool   `json:"clearImage"`
}

type App struct {
	mu                sync.RWMutex
	repos             []Repo
	overrides         map[string]RepoOverride
	siteData          SiteData
	missionControl    MissionControlStore
	mongoStore        *MongoStore
	githubUser        string
	githubToken       string
	thmUser           string
	thmSession        string
	thmCookie         string
	thmSkillsRole     string
	thmSkillsSegment  string
	adminUsername     string
	adminPasswordHash string
	adminSessions     map[string]time.Time
	loginLimiter      *loginLimiter
	gitBackup         *gitBackup
	thmCacheBody      []byte
	thmCacheExpiresAt time.Time
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
	adminUser := strings.TrimSpace(os.Getenv("ADMIN_USERNAME"))
	if adminUser == "" {
		adminUser = "shayden"
	}
	adminHash := strings.TrimSpace(os.Getenv("ADMIN_PASSWORD_HASH"))
	adminPassLegacy := strings.TrimSpace(os.Getenv("ADMIN_PASSWORD"))
	if adminHash == "" && adminPassLegacy != "" {
		generatedHash, err := newPBKDF2PasswordHash(adminPassLegacy)
		if err != nil {
			panic(fmt.Errorf("failed to generate ADMIN_PASSWORD_HASH from ADMIN_PASSWORD: %w", err))
		}
		adminHash = generatedHash
		fmt.Println("Using legacy ADMIN_PASSWORD env var. Set ADMIN_PASSWORD_HASH instead for better secret hygiene.")
	}
	if adminHash == "" {
		panic("missing ADMIN_PASSWORD_HASH (or legacy ADMIN_PASSWORD)")
	}
	if _, _, _, err := parsePBKDF2Hash(adminHash); err != nil {
		panic(fmt.Errorf("invalid ADMIN_PASSWORD_HASH: %w", err))
	}
	app := &App{
		githubUser:        os.Getenv("GITHUB_USERNAME"),
		githubToken:       os.Getenv("GITHUB_TOKEN"),
		thmUser:           os.Getenv("THM_USERNAME"),
		thmSession:        os.Getenv("THM_SESSION"),
		thmCookie:         os.Getenv("THM_COOKIE"),
		thmSkillsRole:     role,
		thmSkillsSegment:  segment,
		overrides:         map[string]RepoOverride{},
		adminUsername:     adminUser,
		adminPasswordHash: adminHash,
		adminSessions:     map[string]time.Time{},
		loginLimiter:      newLoginLimiter(),
	}
	if app.githubUser == "" {
		app.githubUser = "octocat"
	}
	app.gitBackup = newGitBackupFromEnv(app.githubToken)
	app.initMongoStoreFromEnv()
	app.startMongoKeepAlive()
	app.loadSiteData()
	app.loadOverrides()
	app.loadMissionControl()
	app.loadRepoCache()
	go func() {
		if err := app.refreshRepos(); err != nil {
			fmt.Printf("Initial GitHub refresh failed: %v\n", err)
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", app.handleHealth)
	mux.HandleFunc("/api/profile", app.handleProfile)
	mux.HandleFunc("/api/repos", app.handleRepos)
	mux.HandleFunc("/api/admin/repo/", app.handleRepoUpdate)
	mux.HandleFunc("/api/admin/refresh", app.handleRefresh)
	mux.HandleFunc("/api/admin/login", app.handleAdminLogin)
	mux.HandleFunc("/api/admin/logout", app.handleAdminLogout)
	mux.HandleFunc("/api/admin/session", app.handleAdminSession)
	mux.HandleFunc("/api/admin/blog", app.handleAdminBlogCreate)
	mux.HandleFunc("/api/admin/blog/", app.handleAdminBlogItem)
	mux.HandleFunc("/api/admin/mission-control", app.handleAdminMissionControl)
	mux.HandleFunc("/api/admin/mission-control/", app.handleAdminMissionControlSubroute)
	mux.HandleFunc("/api/admin/tryhackme/snapshot", app.handleAdminTHMSnapshot)
	mux.HandleFunc("/api/admin/tryhackme/rooms", app.handleAdminTHMManualRooms)
	mux.HandleFunc("/api/admin/tryhackme/rooms/", app.handleAdminTHMManualRooms)
	mux.HandleFunc("/api/admin/tryhackme/skills", app.handleAdminTHMSkillCategories)
	mux.HandleFunc("/api/admin/tryhackme/skills/", app.handleAdminTHMSkillCategories)
	mux.HandleFunc("/api/tryhackme", app.handleTHM)
	mux.HandleFunc("/webhooks/github", app.handleGitHubWebhook)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	fmt.Printf("Admin login enabled for user: %s (set ADMIN_USERNAME/ADMIN_PASSWORD_HASH in production)\n", app.adminUsername)
	fmt.Printf("Backend running on :%s\n", port)
	if err := http.ListenAndServe(":"+port, withCORS(mux)); err != nil {
		panic(err)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
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
		a.siteData = SiteData{
			DisplayName: "Your Name",
			Headline:    "Full-Stack Engineer",
			Bio:         "I build secure, production-ready applications.",
			CVURL:       "",
			LinkedInURL: "",
			Languages:   []string{"Go", "TypeScript", "Python"},
			BlogPosts:   []BlogPost{},
		}
	} else {
		_ = json.Unmarshal(b, &a.siteData)
	}
	if a.siteData.BlogPosts == nil {
		a.siteData.BlogPosts = []BlogPost{}
	}
	if a.mongoStore != nil {
		posts, err := a.mongoStore.LoadBlogPosts()
		if err != nil {
			fmt.Printf("Mongo blog load failed, using JSON fallback: %v\n", err)
		} else if len(posts) == 0 && len(a.siteData.BlogPosts) > 0 {
			// First boot against an empty database: carry over posts that
			// were written to the JSON file so nothing is lost in the switch.
			for _, post := range a.siteData.BlogPosts {
				if err := a.mongoStore.UpsertBlogPost(post); err != nil {
					fmt.Printf("Mongo blog seed failed for %s: %v\n", post.ID, err)
				}
			}
		} else {
			a.siteData.BlogPosts = posts
		}
	}
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

func (a *App) loadRepoCache() {
	b, err := os.ReadFile(repoCacheFile)
	if err != nil {
		return
	}
	var cached []Repo
	if err := json.Unmarshal(b, &cached); err != nil {
		return
	}
	a.mu.Lock()
	a.repos = cached
	a.mu.Unlock()
}

func (a *App) saveRepoCache(repos []Repo) error {
	b, err := json.Marshal(repos)
	if err != nil {
		return err
	}
	return os.WriteFile(repoCacheFile, b, 0o644)
}

func (a *App) saveSiteDataLocked() error {
	b, err := json.MarshalIndent(a.siteData, "", "  ")
	if err != nil {
		return err
	}
	a.backup("data/site_data.json", b, "Update site data (blog posts)")
	return os.WriteFile("data/site_data.json", b, 0o644)
}

func (a *App) handleProfile(w http.ResponseWriter, _ *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	respondJSON(w, a.siteData)
}

func (a *App) handleRepos(w http.ResponseWriter, _ *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	respondJSON(w, a.repos)
}

func (a *App) handleRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !a.isAuthorizedAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
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
	if !a.isAuthorizedAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
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

func (a *App) handleAdminLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ip := clientIP(r)
	if retryAfter := a.loginLimiter.blockedFor(ip, time.Now()); retryAfter > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())+1))
		http.Error(w, "too many login attempts; try again later", http.StatusTooManyRequests)
		return
	}

	var in AdminLoginRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&in); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	username := strings.TrimSpace(in.Username)
	password := strings.TrimSpace(in.Password)
	if username == "" || password == "" {
		http.Error(w, "username and password are required", http.StatusBadRequest)
		return
	}

	// Verify the password even when the username is wrong so both failures
	// take the same time.
	passwordOK := verifyPBKDF2Password(password, a.adminPasswordHash)
	usernameOK := subtle.ConstantTimeCompare([]byte(username), []byte(a.adminUsername)) == 1
	if !usernameOK || !passwordOK {
		a.loginLimiter.recordFailure(ip, time.Now())
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	a.loginLimiter.reset(ip)

	token, err := newSessionToken()
	if err != nil {
		http.Error(w, "failed to create session", http.StatusInternalServerError)
		return
	}
	expiresAt := time.Now().UTC().Add(7 * 24 * time.Hour)

	a.mu.Lock()
	a.cleanExpiredAdminSessionsLocked(time.Now().UTC())
	a.adminSessions[token] = expiresAt
	a.mu.Unlock()

	respondJSON(w, AdminLoginResponse{
		Token:     token,
		Username:  a.adminUsername,
		ExpiresAt: expiresAt.Format(time.RFC3339),
	})
}

func (a *App) handleAdminLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	token := bearerTokenFromRequest(r)
	if token != "" {
		a.mu.Lock()
		delete(a.adminSessions, token)
		a.mu.Unlock()
	}
	respondJSON(w, map[string]any{"status": "ok"})
}

func (a *App) handleAdminSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !a.isAuthorizedAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	respondJSON(w, map[string]any{
		"authenticated": true,
		"username":      a.adminUsername,
		"storage":       a.storageMode(),
		"gitBackup":     a.gitBackupStatus(),
	})
}

func (a *App) handleAdminBlogCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !a.isAuthorizedAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var in AdminBlogCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	content := strings.TrimSpace(in.Content)
	if content == "" {
		http.Error(w, "post content is required", http.StatusBadRequest)
		return
	}
	if utf8Len(content) > 1000 {
		http.Error(w, "post content must be 1000 characters or fewer", http.StatusBadRequest)
		return
	}

	imageData := strings.TrimSpace(in.ImageData)
	if err := validateBlogImageData(imageData); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	postIDToken, err := newSessionToken()
	if err != nil {
		http.Error(w, "failed to create post id", http.StatusInternalServerError)
		return
	}
	post := BlogPost{
		ID:        "post-" + postIDToken[:12],
		Content:   content,
		ImageData: imageData,
		CreatedAt: now.Format(time.RFC3339),
		Date:      now.Format("2006-01-02"),
		Excerpt:   truncateRunes(content, 180),
	}

	if a.mongoStore != nil {
		if err := a.mongoStore.UpsertBlogPost(post); err != nil {
			http.Error(w, "failed to save blog post", http.StatusInternalServerError)
			return
		}
	}

	a.mu.Lock()
	a.siteData.BlogPosts = append([]BlogPost{post}, a.siteData.BlogPosts...)
	// The JSON file is the primary store without MongoDB and a local backup
	// (and migration seed) with it.
	if err := a.saveSiteDataLocked(); err != nil && a.mongoStore == nil {
		a.mu.Unlock()
		http.Error(w, "failed to save blog post", http.StatusInternalServerError)
		return
	}
	a.mu.Unlock()

	respondJSON(w, map[string]any{
		"status":  "created",
		"post":    post,
		"storage": a.storageMode(),
	})
}

// handleAdminBlogItem edits (PUT) or removes (DELETE) /api/admin/blog/<id>.
func (a *App) handleAdminBlogItem(w http.ResponseWriter, r *http.Request) {
	if !a.isAuthorizedAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/blog/"), "/")
	if id == "" {
		http.Error(w, "post id is required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodPut, http.MethodPatch:
		var in AdminBlogUpdateRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<20)).Decode(&in); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		content := strings.TrimSpace(in.Content)
		if content == "" {
			http.Error(w, "post content is required", http.StatusBadRequest)
			return
		}
		if utf8Len(content) > 1000 {
			http.Error(w, "post content must be 1000 characters or fewer", http.StatusBadRequest)
			return
		}
		imageData := strings.TrimSpace(in.ImageData)
		if err := validateBlogImageData(imageData); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		a.mu.Lock()
		idx := -1
		for i := range a.siteData.BlogPosts {
			if a.siteData.BlogPosts[i].ID == id {
				idx = i
				break
			}
		}
		if idx < 0 {
			a.mu.Unlock()
			http.Error(w, "post not found", http.StatusNotFound)
			return
		}
		post := a.siteData.BlogPosts[idx]
		post.Content = content
		post.Excerpt = truncateRunes(content, 180)
		if in.ClearImage {
			post.ImageData = ""
		} else if imageData != "" {
			post.ImageData = imageData
		}
		if a.mongoStore != nil {
			if err := a.mongoStore.UpsertBlogPost(post); err != nil {
				a.mu.Unlock()
				http.Error(w, "failed to save blog post", http.StatusInternalServerError)
				return
			}
		}
		a.siteData.BlogPosts[idx] = post
		if err := a.saveSiteDataLocked(); err != nil && a.mongoStore == nil {
			a.mu.Unlock()
			http.Error(w, "failed to save blog post", http.StatusInternalServerError)
			return
		}
		a.mu.Unlock()
		respondJSON(w, map[string]any{"status": "updated", "post": post, "storage": a.storageMode()})

	case http.MethodDelete:
		if a.mongoStore != nil {
			if err := a.mongoStore.DeleteBlogPost(id); err != nil {
				http.Error(w, "failed to delete blog post", http.StatusInternalServerError)
				return
			}
		}
		a.mu.Lock()
		kept := make([]BlogPost, 0, len(a.siteData.BlogPosts))
		found := false
		for _, post := range a.siteData.BlogPosts {
			if post.ID == id {
				found = true
				continue
			}
			kept = append(kept, post)
		}
		if !found && a.mongoStore == nil {
			a.mu.Unlock()
			http.Error(w, "post not found", http.StatusNotFound)
			return
		}
		a.siteData.BlogPosts = kept
		if err := a.saveSiteDataLocked(); err != nil && a.mongoStore == nil {
			a.mu.Unlock()
			http.Error(w, "failed to delete blog post", http.StatusInternalServerError)
			return
		}
		a.mu.Unlock()
		respondJSON(w, map[string]any{"status": "deleted", "id": id, "storage": a.storageMode()})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *App) cleanExpiredAdminSessionsLocked(now time.Time) {
	for token, expiresAt := range a.adminSessions {
		if now.After(expiresAt) {
			delete(a.adminSessions, token)
		}
	}
}

func (a *App) isAuthorizedAdmin(r *http.Request) bool {
	token := bearerTokenFromRequest(r)
	if token == "" {
		return false
	}
	now := time.Now().UTC()
	a.mu.Lock()
	defer a.mu.Unlock()
	a.cleanExpiredAdminSessionsLocked(now)
	expiresAt, ok := a.adminSessions[token]
	if !ok {
		return false
	}
	if now.After(expiresAt) {
		delete(a.adminSessions, token)
		return false
	}
	return true
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
	client := &http.Client{Timeout: 8 * time.Second}
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
	if err := a.saveRepoCache(out); err != nil {
		fmt.Printf("Unable to write repo cache: %v\n", err)
	}
	return nil
}

func (a *App) handleTHM(w http.ResponseWriter, _ *http.Request) {
	if a.thmUser == "" {
		respondJSON(w, map[string]any{"enabled": false, "message": "Set THM_USERNAME to enable TryHackMe stats."})
		return
	}

	now := time.Now().UTC()
	a.mu.RLock()
	cacheHit := len(a.thmCacheBody) > 0 && now.Before(a.thmCacheExpiresAt)
	cacheBody := append([]byte(nil), a.thmCacheBody...)
	a.mu.RUnlock()
	if cacheHit {
		respondJSONBytes(w, cacheBody)
		return
	}

	client := &http.Client{Timeout: 12 * time.Second}
	profileURL := "https://tryhackme.com/api/v2/public-profile?username=" + url.QueryEscape(a.thmUser)
	profileData, profileErr := a.fetchTHMJSON(client, profileURL)

	canUsePrivateTHMEndpoints := a.hasTHMAuthSession()

	skillsURL := fmt.Sprintf(
		"https://tryhackme.com/api/v2/users/skills?role=%s&segment=%s",
		url.QueryEscape(a.thmSkillsRole),
		url.QueryEscape(a.thmSkillsSegment),
	)
	var skillsData any
	var skillsErr error
	if canUsePrivateTHMEndpoints {
		skillsData, skillsErr = a.fetchTHMJSON(client, skillsURL)
	} else {
		skillsErr = fmt.Errorf("TryHackMe skills endpoint requires THM_COOKIE or THM_SESSION; using public profile data only")
	}
	if skillsErr == nil && len(normalizeTHMSkills(skillsData)) == 0 {
		skillsErr = fmt.Errorf("skills endpoint returned no parsable matrix values; ensure THM_COOKIE/THM_SESSION includes a valid connect.sid session")
	}

	var fetchedRooms []string
	var fetchedRoomsCount int
	var roomsErr error
	roomsSource := "public-profile"
	if canUsePrivateTHMEndpoints {
		fetchedRooms, fetchedRoomsCount, roomsErr = a.fetchTHMCompletedRooms(client)
		if roomsErr == nil {
			roomsSource = "/api/all-completed-rooms"
		}
	} else if len(extractTHMRoomNames(profileData)) == 0 {
		roomsErr = fmt.Errorf("TryHackMe rooms endpoints require THM_COOKIE or THM_SESSION; no public room list was available")
	}

	// Fall back to the stored snapshot for whichever parts failed live.
	snapshot, snapshotErr := a.loadTHMSnapshot()
	snapPayload := snapshot.payload()
	stale := map[string]bool{}
	if profileErr != nil && snapPayload != nil && snapPayload["publicProfile"] != nil {
		profileData = snapPayload["publicProfile"]
		stale["profile"] = true
	}
	if skillsErr != nil && snapPayload != nil {
		if sr, ok := snapPayload["skillsResponse"].(map[string]any); ok && len(normalizeTHMSkills(sr["data"])) > 0 {
			skillsData = sr["data"]
			stale["skills"] = true
		}
	}
	if roomsErr != nil && snapPayload != nil {
		if rooms := toStringSlice(snapPayload["completedRooms"]); len(rooms) > 0 {
			fetchedRooms = rooms
			if n, ok := asFloat64(snapPayload["completedRoomsCount"]); ok {
				fetchedRoomsCount = int(n + 0.5)
			}
			if src, ok := snapPayload["completedRoomsSource"].(string); ok && src != "" {
				roomsSource = src
			}
			stale["rooms"] = true
		}
	}

	if profileData == nil {
		response := map[string]any{
			"enabled":      true,
			"error":        "Unable to fetch TryHackMe data and no snapshot is stored yet. Sign in and use the TryHackMe sync panel in Mission Control.",
			"profileError": shortTHMError(profileErr),
			"skillsError":  shortTHMError(skillsErr),
			"roomsError":   shortTHMError(roomsErr),
		}
		a.cacheTHMResponse(response)
		respondJSON(w, response)
		return
	}

	payload := a.buildTHMPayload(profileData, skillsData, fetchedRooms, fetchedRoomsCount, roomsSource)
	if profileErr != nil && !stale["profile"] {
		payload["profileError"] = shortTHMError(profileErr)
	}
	if skillsErr != nil && !stale["skills"] {
		payload["skillsError"] = shortTHMError(skillsErr)
	}
	if roomsErr != nil && !stale["rooms"] {
		payload["completedRoomsError"] = shortTHMError(roomsErr)
	}

	// Everything that came back live is worth keeping for next time, unless
	// the admin pasted a manual snapshot: that one carries the full skills and
	// room data the public endpoint lacks, so a live profile must not replace it.
	// A failed snapshot read must not be mistaken for "no snapshot" either,
	// or the live payload would silently replace whatever is stored.
	if profileErr == nil && snapshotErr == nil && (snapshot == nil || snapshot.Source != "manual") {
		_ = a.saveTHMSnapshot(payload, "live")
	}
	a.applyTHMCustomization(payload)

	response := map[string]any{"enabled": true, "data": payload}
	if len(stale) > 0 {
		response["stale"] = true
		response["staleParts"] = stale
		if snapshot != nil {
			response["snapshotUpdatedAt"] = snapshot.UpdatedAt
			response["snapshotSource"] = snapshot.Source
		}
		response["liveError"] = shortTHMError(profileErr)
	}
	a.cacheTHMResponse(response)
	respondJSON(w, response)
}

func (a *App) hasTHMAuthSession() bool {
	return strings.TrimSpace(a.thmCookieHeader()) != ""
}

func (a *App) cacheTHMResponse(payload any) {
	body, err := json.Marshal(payload)
	if err != nil {
		return
	}
	a.mu.Lock()
	a.thmCacheBody = body
	a.thmCacheExpiresAt = time.Now().UTC().Add(thmCacheTTL)
	a.mu.Unlock()
}

func (a *App) fetchTHMJSON(client *http.Client, endpoint string) (any, error) {
	req, _ := http.NewRequest(http.MethodGet, endpoint, nil)
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Referer", "https://tryhackme.com/")
	req.Header.Set("Origin", "https://tryhackme.com")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	if cookie := a.thmCookieHeader(); cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	trimmed := strings.TrimSpace(string(body))

	if resp.StatusCode >= 300 {
		msg := trimmed
		if msg == "" {
			msg = http.StatusText(resp.StatusCode)
		}
		return nil, fmt.Errorf("status %d from %s: %s", resp.StatusCode, endpoint, msg)
	}

	if trimmed == "" {
		return nil, fmt.Errorf("empty response body from %s", endpoint)
	}

	raw := bytes.TrimSpace(body)
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		preview := strings.TrimSpace(string(raw))
		preview = strings.ReplaceAll(preview, "\n", " ")
		preview = strings.ReplaceAll(preview, "\r", " ")
		if len(preview) > 180 {
			preview = preview[:180] + "..."
		}
		if len(raw) > 0 && raw[0] == '<' {
			return nil, fmt.Errorf("non-JSON HTML response from %s (likely blocked or auth/session issue)", endpoint)
		}
		return nil, fmt.Errorf("invalid JSON from %s: %v (body preview: %s)", endpoint, err, preview)
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

func (a *App) fetchTHMCompletedRooms(client *http.Client) ([]string, int, error) {
	if strings.TrimSpace(a.thmUser) == "" {
		return nil, 0, fmt.Errorf("missing THM username")
	}

	var out []string
	expectedCount := 0

	primaryRooms, primaryCount, primaryErr := a.fetchTHMCompletedRoomsFromAllCompletedEndpoint(client)
	out = mergeUniqueStrings(out, primaryRooms)
	if primaryCount > expectedCount {
		expectedCount = primaryCount
	}

	var fallbackErr error
	if len(out) == 0 || primaryErr != nil {
		fallbackRooms, fallbackCount, err := a.fetchTHMCompletedRoomsFromMyRoomsEndpoint(client)
		fallbackErr = err
		out = mergeUniqueStrings(out, fallbackRooms)
		if fallbackCount > expectedCount {
			expectedCount = fallbackCount
		}
	}

	countEndpoint, countErr := a.fetchTHMCompletedRoomCount(client)
	if countErr == nil && countEndpoint > expectedCount {
		expectedCount = countEndpoint
	}
	if expectedCount < len(out) {
		expectedCount = len(out)
	}

	if len(out) > 0 {
		return out, expectedCount, nil
	}

	if primaryErr != nil && fallbackErr != nil {
		return nil, expectedCount, fmt.Errorf("all-completed-rooms failed: %v; my-rooms fallback failed: %v", primaryErr, fallbackErr)
	}
	if primaryErr != nil {
		return nil, expectedCount, primaryErr
	}
	if fallbackErr != nil {
		return nil, expectedCount, fallbackErr
	}

	return out, expectedCount, nil
}

func (a *App) fetchTHMCompletedRoomsFromAllCompletedEndpoint(client *http.Client) ([]string, int, error) {
	const pageSize = thmRoomsPageSize
	const maxPages = 40

	var out []string
	expectedCount := 0
	var firstErr error

	for page := 1; page <= maxPages; page++ {
		endpoint := thmRoomsPageURL(url.QueryEscape(a.thmUser), page)
		data, err := a.fetchTHMJSON(client, endpoint)
		if err != nil {
			if page == 1 {
				firstErr = err
			}
			break
		}

		pageRooms := extractTHMRoomNames(data)
		before := len(out)
		out = mergeUniqueStrings(out, pageRooms)
		added := len(out) - before

		if count, ok := extractTHMRoomCount(data); ok && count > expectedCount {
			expectedCount = count
		}
		if added == 0 || len(pageRooms) < pageSize {
			break
		}
		if expectedCount > 0 && len(out) >= expectedCount {
			break
		}
	}

	if expectedCount < len(out) {
		expectedCount = len(out)
	}
	if len(out) == 0 && firstErr != nil {
		return nil, expectedCount, firstErr
	}
	return out, expectedCount, nil
}

func (a *App) fetchTHMCompletedRoomsFromMyRoomsEndpoint(client *http.Client) ([]string, int, error) {
	const pageSize = 100
	const maxPages = 20

	var out []string
	var firstErr error

	for page := 1; page <= maxPages; page++ {
		endpoint := fmt.Sprintf("https://tryhackme.com/api/my-rooms?limit=%d&page=%d", pageSize, page)
		data, err := a.fetchTHMJSON(client, endpoint)
		if err != nil {
			if page == 1 {
				firstErr = err
			}
			break
		}

		pageRooms, hasNext := extractTHMCompletedRoomsFromMyRooms(data)
		out = mergeUniqueStrings(out, pageRooms)

		if !hasNext {
			break
		}
	}

	if len(out) == 0 && firstErr != nil {
		return nil, 0, firstErr
	}
	return out, len(out), nil
}

func (a *App) fetchTHMCompletedRoomCount(client *http.Client) (int, error) {
	endpoint := "https://tryhackme.com/api/no-completed-rooms-public/" + url.PathEscape(a.thmUser)
	data, err := a.fetchTHMJSON(client, endpoint)
	if err != nil {
		return 0, err
	}
	if count, ok := extractTHMRoomCount(data); ok {
		return count, nil
	}
	if m, ok := data.(map[string]any); ok {
		if n, ok := pickFirstNumericField(m, "count", "total"); ok {
			if n < 0 {
				n = 0
			}
			return int(n + 0.5), nil
		}
	}
	return 0, fmt.Errorf("count endpoint returned no parseable numeric value")
}

func mergeUniqueStrings(base []string, extra []string) []string {
	if len(extra) == 0 {
		return base
	}
	seen := make(map[string]struct{}, len(base)+len(extra))
	out := make([]string, 0, len(base)+len(extra))
	for _, item := range base {
		normalized := strings.ToLower(strings.TrimSpace(item))
		if normalized == "" {
			continue
		}
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		out = append(out, strings.TrimSpace(item))
	}
	for _, item := range extra {
		normalized := strings.ToLower(strings.TrimSpace(item))
		if normalized == "" {
			continue
		}
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		out = append(out, strings.TrimSpace(item))
	}
	return out
}

func extractTHMRoomCount(raw any) (int, bool) {
	normalize := func(v float64) int {
		if v < 0 {
			return 0
		}
		return int(v + 0.5)
	}

	if n, ok := asFloat64(raw); ok {
		return normalize(n), true
	}

	if m, ok := raw.(map[string]any); ok {
		if n, ok := pickFirstNumericField(
			m,
			"completedRoomsNumber",
			"completedroomsnumber",
			"roomsCompleted",
			"roomscompleted",
			"completedRooms",
			"completedrooms",
			"roomCount",
			"roomcount",
			"rooms_count",
			"noCompletedRooms",
			"allCompletedRooms",
			"totalDocs",
			"totalRooms",
			"totalCompletedRooms",
		); ok {
			return normalize(n), true
		}
		if n, ok := asFloat64(m["data"]); ok {
			return normalize(n), true
		}
	}

	if n, ok := pickDeepNumericField(
		raw,
		"completedRoomsNumber",
		"completedroomsnumber",
		"roomsCompleted",
		"roomscompleted",
		"completedRooms",
		"completedrooms",
		"roomCount",
		"roomcount",
		"rooms_count",
		"noCompletedRooms",
		"allCompletedRooms",
		"totalDocs",
		"totalRooms",
		"totalCompletedRooms",
	); ok {
		return normalize(n), true
	}
	return 0, false
}

func extractTHMRoomNames(raw any) []string {
	if raw == nil {
		return nil
	}

	var out []string
	seen := map[string]struct{}{}
	add := func(v string) {
		name := strings.TrimSpace(v)
		if name == "" {
			return
		}
		key := strings.ToLower(name)
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		out = append(out, name)
	}

	var walk func(node any, parentKey string)
	walk = func(node any, parentKey string) {
		switch t := node.(type) {
		case map[string]any:
			if looksLikeRoomObject(t) {
				if name := extractTHMRoomNameFromMap(t); name != "" {
					add(name)
				}
			}

			for k, child := range t {
				key := strings.ToLower(strings.TrimSpace(k))

				if arr, ok := child.([]any); ok && looksLikeRoomCollectionKey(key) {
					for _, item := range arr {
						switch roomNode := item.(type) {
						case string:
							add(roomNode)
						case map[string]any:
							if name := extractTHMRoomNameFromMap(roomNode); name != "" {
								add(name)
							}
						}
					}
				}

				walk(child, key)
			}
		case []any:
			for _, child := range t {
				switch roomNode := child.(type) {
				case string:
					if looksLikeRoomCollectionKey(parentKey) {
						add(roomNode)
					}
				case map[string]any:
					if looksLikeRoomCollectionKey(parentKey) || looksLikeRoomObject(roomNode) {
						if name := extractTHMRoomNameFromMap(roomNode); name != "" {
							add(name)
						}
					}
					walk(roomNode, parentKey)
				default:
					walk(roomNode, parentKey)
				}
			}
		}
	}

	walk(raw, "")
	return out
}

func looksLikeRoomCollectionKey(key string) bool {
	n := strings.ToLower(strings.TrimSpace(key))
	if n == "" {
		return false
	}
	if n == "rooms" || n == "room" {
		return true
	}
	// Generic pagination containers used by the v2 endpoints.
	switch n {
	case "docs", "items", "results", "entries", "list", "data":
		return true
	}
	if strings.Contains(n, "completedroom") || strings.Contains(n, "roomscompleted") || strings.Contains(n, "allcompletedroom") {
		return true
	}
	if strings.Contains(n, "roomlist") || strings.Contains(n, "roomslist") || strings.Contains(n, "joinedrooms") {
		return true
	}
	return false
}

func looksLikeRoomObject(m map[string]any) bool {
	if m == nil {
		return false
	}
	hasRoomKey := false
	for k := range m {
		key := strings.ToLower(strings.TrimSpace(k))
		if strings.Contains(key, "room") {
			hasRoomKey = true
			break
		}
	}
	if hasRoomKey {
		return true
	}
	_, hasCode := m["code"]
	_, hasSlug := m["slug"]
	_, hasTitle := m["title"]
	_, hasName := m["name"]
	return (hasCode || hasSlug) && (hasTitle || hasName)
}

func extractTHMRoomNameFromMap(m map[string]any) string {
	if m == nil {
		return ""
	}
	if s, ok := pickFirstStringField(
		m,
		"title",
		"name",
		"roomName",
		"roomname",
		"roomTitle",
		"roomtitle",
	); ok {
		return s
	}
	if s, ok := pickFirstStringField(
		m,
		"slug",
		"code",
		"roomCode",
		"roomcode",
	); ok {
		return s
	}
	return ""
}

func extractTHMCompletedRoomsFromMyRooms(raw any) ([]string, bool) {
	root, ok := raw.(map[string]any)
	if !ok {
		return nil, false
	}

	roomsRaw, _ := root["rooms"].([]any)
	out := make([]string, 0, len(roomsRaw))

	for _, item := range roomsRaw {
		room, ok := item.(map[string]any)
		if !ok {
			continue
		}

		completed, ok := asBool(room["userCompleted"])
		if !ok {
			completed = false
		}
		if !completed {
			for _, key := range []string{"completed", "isCompleted", "roomCompleted", "userRoomCompleted"} {
				if b, ok := asBool(room[key]); ok && b {
					completed = true
					break
				}
			}
		}
		if !completed {
			if progress, ok := asFloat64(room["progressPercentage"]); ok && progress >= 100 {
				completed = true
			}
		}
		if !completed {
			if progress, ok := asFloat64(room["userProgress"]); ok && progress >= 100 {
				completed = true
			}
		}
		if !completed {
			// Some payloads expose task counters instead of a boolean completion field.
			doneTasks, hasDone := asFloat64(room["completedTasks"])
			totalTasks, hasTotal := asFloat64(room["totalTasks"])
			if hasDone && hasTotal && totalTasks > 0 && doneTasks >= totalTasks {
				completed = true
			}
		}
		if !completed {
			continue
		}

		name := extractTHMRoomNameFromMap(room)
		if name != "" {
			out = append(out, name)
		}
	}

	hasNext := false
	if paginator, ok := root["paginator"].(map[string]any); ok {
		if b, ok := asBool(paginator["hasNextPage"]); ok {
			hasNext = b
		}
		if !hasNext {
			page, hasPage := asFloat64(paginator["page"])
			totalPages, hasTotalPages := asFloat64(paginator["totalPages"])
			if hasPage && hasTotalPages && totalPages > 0 && page < totalPages {
				hasNext = true
			}
		}
	}

	return out, hasNext
}

func respondJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func respondJSONBytes(w http.ResponseWriter, body []byte) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(body)
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

func bearerTokenFromRequest(r *http.Request) string {
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if auth == "" {
		return ""
	}
	lower := strings.ToLower(auth)
	if !strings.HasPrefix(lower, "bearer ") {
		return ""
	}
	token := strings.TrimSpace(auth[len("Bearer "):])
	return token
}

func newSessionToken() (string, error) {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func utf8Len(s string) int {
	count := 0
	for range s {
		count++
	}
	return count
}

func truncateRunes(s string, limit int) string {
	if limit <= 0 {
		return ""
	}
	runes := []rune(strings.TrimSpace(s))
	if len(runes) <= limit {
		return string(runes)
	}
	return string(runes[:limit]) + "..."
}

func validateBlogImageData(imageData string) error {
	if imageData == "" {
		return nil
	}
	if !strings.HasPrefix(imageData, "data:image/") {
		return fmt.Errorf("image must be a data URL beginning with data:image/")
	}
	parts := strings.SplitN(imageData, ",", 2)
	if len(parts) != 2 {
		return fmt.Errorf("invalid image data URL")
	}
	header := strings.ToLower(strings.TrimSpace(parts[0]))
	if !strings.Contains(header, ";base64") {
		return fmt.Errorf("image data URL must use base64 encoding")
	}
	encoded := strings.TrimSpace(parts[1])
	if encoded == "" {
		return fmt.Errorf("image payload is empty")
	}
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		decoded, err = base64.RawStdEncoding.DecodeString(encoded)
		if err != nil {
			return fmt.Errorf("invalid base64 image payload")
		}
	}
	if len(decoded) > 4<<20 {
		return fmt.Errorf("image too large (max 4MB)")
	}
	return nil
}

func newPBKDF2PasswordHash(password string) (string, error) {
	password = strings.TrimSpace(password)
	if password == "" {
		return "", fmt.Errorf("password cannot be empty")
	}
	const iterations = 600000
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	derived := pbkdf2SHA256([]byte(password), salt, iterations, 32)
	return fmt.Sprintf(
		"pbkdf2_sha256$%d$%s$%s",
		iterations,
		base64.RawURLEncoding.EncodeToString(salt),
		base64.RawURLEncoding.EncodeToString(derived),
	), nil
}

func verifyPBKDF2Password(password string, encodedHash string) bool {
	iterations, salt, expected, err := parsePBKDF2Hash(encodedHash)
	if err != nil {
		return false
	}
	derived := pbkdf2SHA256([]byte(password), salt, iterations, len(expected))
	return subtle.ConstantTimeCompare(derived, expected) == 1
}

func parsePBKDF2Hash(encodedHash string) (int, []byte, []byte, error) {
	parts := strings.Split(strings.TrimSpace(encodedHash), "$")
	if len(parts) != 4 {
		return 0, nil, nil, fmt.Errorf("invalid hash format")
	}
	if parts[0] != "pbkdf2_sha256" {
		return 0, nil, nil, fmt.Errorf("unsupported hash algorithm")
	}
	iterations, err := strconv.Atoi(parts[1])
	if err != nil || iterations < 100000 || iterations > 5000000 {
		return 0, nil, nil, fmt.Errorf("invalid iteration count")
	}
	salt, err := decodeBase64String(parts[2])
	if err != nil || len(salt) < 8 {
		return 0, nil, nil, fmt.Errorf("invalid salt")
	}
	expected, err := decodeBase64String(parts[3])
	if err != nil || len(expected) < 16 {
		return 0, nil, nil, fmt.Errorf("invalid hash payload")
	}
	return iterations, salt, expected, nil
}

func decodeBase64String(value string) ([]byte, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, fmt.Errorf("empty value")
	}
	if decoded, err := base64.RawURLEncoding.DecodeString(value); err == nil {
		return decoded, nil
	}
	if decoded, err := base64.URLEncoding.DecodeString(value); err == nil {
		return decoded, nil
	}
	if decoded, err := base64.RawStdEncoding.DecodeString(value); err == nil {
		return decoded, nil
	}
	decoded, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return nil, err
	}
	return decoded, nil
}

func pbkdf2SHA256(password []byte, salt []byte, iterations int, keyLen int) []byte {
	if iterations <= 0 || keyLen <= 0 {
		return nil
	}
	hLen := 32
	blocks := (keyLen + hLen - 1) / hLen
	derived := make([]byte, 0, blocks*hLen)

	for block := 1; block <= blocks; block++ {
		mac := hmac.New(sha256.New, password)
		mac.Write(salt)

		var blockBuf [4]byte
		binary.BigEndian.PutUint32(blockBuf[:], uint32(block))
		mac.Write(blockBuf[:])
		u := mac.Sum(nil)

		t := make([]byte, len(u))
		copy(t, u)

		for i := 1; i < iterations; i++ {
			mac = hmac.New(sha256.New, password)
			mac.Write(u)
			u = mac.Sum(nil)
			for j := range t {
				t[j] ^= u[j]
			}
		}
		derived = append(derived, t...)
	}
	return derived[:keyLen]
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

func asBool(v any) (bool, bool) {
	switch t := v.(type) {
	case bool:
		return t, true
	case string:
		n := strings.ToLower(strings.TrimSpace(t))
		switch n {
		case "true", "1", "yes":
			return true, true
		case "false", "0", "no":
			return false, true
		default:
			return false, false
		}
	case float64:
		return t != 0, true
	case int:
		return t != 0, true
	case int64:
		return t != 0, true
	default:
		return false, false
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
	scores := map[string]float64{}

	var walk func(any)
	walk = func(node any) {
		switch t := node.(type) {
		case map[string]any:
			if name, ok := pickFirstStringField(t, "name", "skill", "title", "category", "label", "dimension"); ok {
				if canonical, ok := canonicalTHMSkillName(name); ok {
					if value, ok := pickFirstNumericField(t, "value", "score", "level", "progress", "percent", "percentage", "points", "xp", "completed"); ok {
						setTHMSkillScore(scores, canonical, value)
					} else if value, ok := pickDeepNumericField(t, "value", "score", "level", "progress", "percent", "percentage", "points", "xp", "completed"); ok {
						setTHMSkillScore(scores, canonical, value)
					}
				}
			}

			for k, v := range t {
				if canonical, ok := canonicalTHMSkillName(k); ok {
					if n, ok := asFloat64(v); ok {
						setTHMSkillScore(scores, canonical, n)
					} else if childMap, ok := v.(map[string]any); ok {
						if n, ok := pickFirstNumericField(childMap, "value", "score", "level", "progress", "percent", "percentage", "points", "xp", "completed"); ok {
							setTHMSkillScore(scores, canonical, n)
						} else if n, ok := pickDeepNumericField(childMap, "value", "score", "level", "progress", "percent", "percentage", "points", "xp", "completed"); ok {
							setTHMSkillScore(scores, canonical, n)
						}
					}
				}
				if v != nil {
					walk(v)
				}
			}
		case []any:
			for _, child := range t {
				walk(child)
			}
		}
	}

	walk(raw)
	if len(scores) == 0 {
		return nil
	}

	out := make([]THMSkill, 0, len(scores))
	for _, name := range thmSkillCanonicalOrder() {
		if value, ok := scores[name]; ok {
			out = append(out, THMSkill{Name: name, Value: value})
		}
	}
	return out
}

func setTHMSkillScore(dst map[string]float64, name string, raw float64) {
	value := raw
	if value < 0 {
		value = 0
	}
	if value <= 1 {
		value *= 100
	}
	if value > 100 {
		value = 100
	}
	current, exists := dst[name]
	if !exists || value > current {
		dst[name] = value
	}
}

func canonicalTHMSkillName(name string) (string, bool) {
	n := strings.ToLower(strings.TrimSpace(name))
	n = strings.ReplaceAll(n, "_", " ")
	n = strings.ReplaceAll(n, "-", " ")
	n = strings.Join(strings.Fields(n), " ")
	n = strings.TrimSpace(n)
	if n == "" {
		return "", false
	}
	switch {
	case strings.Contains(n, "security operations") || strings.Contains(n, "secops") || n == "soc":
		return "Security Operations", true
	case strings.Contains(n, "incident response"):
		return "Incident Response", true
	case strings.Contains(n, "malware analysis") || n == "malware":
		return "Malware Analysis", true
	case strings.Contains(n, "penetration testing") || strings.Contains(n, "pentest") || strings.Contains(n, "pentesting"):
		return "Penetration Testing", true
	case strings.Contains(n, "exploitation") || strings.Contains(n, "exploit development") || n == "exploitation":
		return "Exploitation", true
	case strings.Contains(n, "red teaming") || strings.Contains(n, "red team"):
		return "Red Teaming", true
	default:
		return "", false
	}
}

func thmSkillCanonicalOrder() []string {
	return []string{
		"Security Operations",
		"Incident Response",
		"Malware Analysis",
		"Penetration Testing",
		"Exploitation",
		"Red Teaming",
	}
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
