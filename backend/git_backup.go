package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// The JSON files under data/ live on an ephemeral disk in production and are
// wiped on every deploy. When MongoDB is not available, the admin's edits can
// still be made durable by committing the changed file back to the GitHub
// repository, which then ships it as the seed for the next deploy.
//
// Opt in with GIT_BACKUP_REPO=owner/name (GITHUB_TOKEN must have "contents:
// write"). GIT_BACKUP_BRANCH defaults to main and GIT_BACKUP_PREFIX to
// "backend/", the service's rootDir on Render.

type gitBackup struct {
	repo   string
	branch string
	prefix string
	token  string

	mu       sync.Mutex
	lastHash map[string]string
	status   map[string]string
}

func newGitBackupFromEnv(token string) *gitBackup {
	repo := strings.Trim(strings.TrimSpace(os.Getenv("GIT_BACKUP_REPO")), "/")
	if repo == "" {
		return nil
	}
	if strings.TrimSpace(token) == "" {
		fmt.Println("GIT_BACKUP_REPO is set but GITHUB_TOKEN is empty; git backup disabled")
		return nil
	}
	branch := strings.TrimSpace(os.Getenv("GIT_BACKUP_BRANCH"))
	if branch == "" {
		branch = "main"
	}
	prefix, set := os.LookupEnv("GIT_BACKUP_PREFIX")
	if !set {
		prefix = "backend/"
	}
	prefix = strings.Trim(strings.TrimSpace(prefix), "/")
	if prefix == "." {
		prefix = ""
	}
	if prefix != "" && !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	fmt.Printf("Git backup enabled (repo=%s branch=%s prefix=%s)\n", repo, branch, prefix)
	return &gitBackup{
		repo:     repo,
		branch:   branch,
		prefix:   prefix,
		token:    token,
		lastHash: map[string]string{},
		status:   map[string]string{},
	}
}

// backup commits relPath (for example "data/site_data.json") with the given
// content in the background. Unchanged content is skipped so repeated saves
// do not produce empty commits.
func (a *App) backup(relPath string, content []byte, message string) {
	g := a.gitBackup
	if g == nil {
		return
	}
	sum := sha256.Sum256(content)
	hash := hex.EncodeToString(sum[:])
	g.mu.Lock()
	unchanged := g.lastHash[relPath] == hash
	g.mu.Unlock()
	if unchanged {
		return
	}
	go func() {
		g.mu.Lock()
		defer g.mu.Unlock()
		if err := g.commit(relPath, content, message); err != nil {
			g.status[relPath] = "error: " + err.Error()
			fmt.Printf("Git backup of %s failed: %v\n", relPath, err)
			return
		}
		g.lastHash[relPath] = hash
		g.status[relPath] = "committed " + time.Now().UTC().Format(time.RFC3339)
		fmt.Printf("Git backup of %s committed\n", relPath)
	}()
}

func (a *App) gitBackupStatus() map[string]any {
	g := a.gitBackup
	if g == nil {
		return map[string]any{"enabled": false}
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	files := map[string]string{}
	for k, v := range g.status {
		files[k] = v
	}
	return map[string]any{
		"enabled": true,
		"repo":    g.repo,
		"branch":  g.branch,
		"files":   files,
	}
}

func (g *gitBackup) apiURL(relPath string) string {
	return fmt.Sprintf("https://api.github.com/repos/%s/contents/%s%s", g.repo, g.prefix, relPath)
}

func (g *gitBackup) do(req *http.Request) (int, []byte, error) {
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Authorization", "Bearer "+g.token)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	return resp.StatusCode, body, nil
}

// commit creates or updates one file through the GitHub contents API.
func (g *gitBackup) commit(relPath string, content []byte, message string) error {
	// Look up the current blob SHA; the API requires it to update a file.
	getReq, _ := http.NewRequest(http.MethodGet, g.apiURL(relPath)+"?ref="+g.branch, nil)
	status, body, err := g.do(getReq)
	if err != nil {
		return err
	}
	var sha string
	switch status {
	case http.StatusOK:
		var current struct {
			SHA     string `json:"sha"`
			Content string `json:"content"`
		}
		if err := json.Unmarshal(body, &current); err != nil {
			return fmt.Errorf("decode current file: %w", err)
		}
		sha = current.SHA
		existing, decErr := base64.StdEncoding.DecodeString(strings.ReplaceAll(current.Content, "\n", ""))
		if decErr == nil && bytes.Equal(existing, content) {
			return nil // already up to date in the repo
		}
	case http.StatusNotFound:
		// New file.
	default:
		return fmt.Errorf("github lookup failed (%d): %s", status, strings.TrimSpace(string(body)))
	}

	payload := map[string]any{
		"message": message,
		"content": base64.StdEncoding.EncodeToString(content),
		"branch":  g.branch,
	}
	if sha != "" {
		payload["sha"] = sha
	}
	encoded, _ := json.Marshal(payload)
	putReq, _ := http.NewRequest(http.MethodPut, g.apiURL(relPath), bytes.NewReader(encoded))
	putReq.Header.Set("Content-Type", "application/json")
	status, body, err = g.do(putReq)
	if err != nil {
		return err
	}
	if status != http.StatusOK && status != http.StatusCreated {
		return fmt.Errorf("github commit failed (%d): %s", status, strings.TrimSpace(string(body)))
	}
	return nil
}
