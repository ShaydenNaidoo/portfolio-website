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
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
)

type MongoStore struct {
	client             *mongo.Client
	database           *mongo.Database
	blogPosts          *mongo.Collection
	missions           *mongo.Collection
	moduleState        *mongo.Collection
	thmSnapshot        *mongo.Collection
	thmManualRooms     *mongo.Collection
	thmSkillCategories *mongo.Collection
	repoOverrides      *mongo.Collection
	images             *mongo.Collection
	siteProfile        *mongo.Collection
}

// Repo overrides are one small document keyed "current": the whole map as
// JSON, mirroring the on-disk file.
type repoOverridesDoc struct {
	ID   string `bson:"id"`
	JSON string `bson:"json"`
}

func (m *MongoStore) LoadRepoOverrides() (map[string]RepoOverride, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	var doc repoOverridesDoc
	err := m.repoOverrides.FindOne(ctx, bson.M{"id": "current"}).Decode(&doc)
	if err != nil {
		if strings.Contains(err.Error(), "no documents") {
			return nil, nil
		}
		return nil, err
	}
	out := map[string]RepoOverride{}
	if strings.TrimSpace(doc.JSON) == "" {
		return out, nil
	}
	if err := json.Unmarshal([]byte(doc.JSON), &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (m *MongoStore) SaveRepoOverrides(overrides map[string]RepoOverride) error {
	b, err := json.Marshal(overrides)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_, err = m.repoOverrides.ReplaceOne(
		ctx,
		bson.M{"id": "current"},
		repoOverridesDoc{ID: "current", JSON: string(b)},
		options.Replace().SetUpsert(true),
	)
	return err
}

func (a *App) initMongoStoreFromEnv() {
	uri := strings.TrimSpace(os.Getenv("MONGODB_URI"))
	if uri == "" {
		return
	}
	databaseName := strings.TrimSpace(os.Getenv("MONGODB_DATABASE"))
	if databaseName == "" {
		databaseName = "portfolio"
	}

	// The JSON fallback lives on an ephemeral disk in production, so a single
	// failed ping at boot (Atlas cold start, brief network blip) must not
	// silently downgrade the whole process to storage that is wiped on the
	// next deploy. Retry a few times before giving up.
	const attempts = 4
	for attempt := 1; attempt <= attempts; attempt++ {
		store, err := newMongoStore(uri, databaseName)
		if err == nil {
			a.mongoStore = store
			fmt.Printf("MongoDB storage enabled (database=%s)\n", databaseName)
			return
		}
		fmt.Printf("MongoDB init attempt %d/%d failed: %v\n", attempt, attempts, err)
		if attempt < attempts {
			time.Sleep(time.Duration(attempt*5) * time.Second)
		}
	}
	fmt.Println("WARNING: MongoDB unavailable; falling back to JSON storage. Blog posts, missions and TryHackMe data saved now will be lost on the next deploy.")
}

// Ping checks the connection; the driver reconnects on its own, so a failed
// ping is transient unless the cluster is gone.
func (m *MongoStore) Ping() error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	return m.client.Ping(ctx, readpref.Primary())
}

// startMongoKeepAlive pings the cluster periodically. Atlas pauses (and
// eventually deletes) free-tier clusters that see no connections for weeks,
// so as long as this process is awake the cluster counts as active.
func (a *App) startMongoKeepAlive() {
	if a.mongoStore == nil {
		return
	}
	go func() {
		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			if err := a.mongoStore.Ping(); err != nil {
				fmt.Printf("MongoDB keep-alive ping failed: %v\n", err)
			}
		}
	}()
}

// handleHealth is meant for an external uptime monitor. Hitting it keeps the
// web service awake and touches MongoDB, so both stay active.
func (a *App) handleHealth(w http.ResponseWriter, _ *http.Request) {
	out := map[string]any{"ok": true, "storage": a.storageMode(), "time": time.Now().UTC().Format(time.RFC3339)}
	if a.mongoStore != nil {
		if err := a.mongoStore.Ping(); err != nil {
			out["ok"] = false
			out["mongoError"] = err.Error()
			w.WriteHeader(http.StatusServiceUnavailable)
		} else {
			out["mongo"] = "connected"
		}
	}
	respondJSON(w, out)
}

// storageMode is reported to the admin UI so it is obvious when writes are
// going to the ephemeral JSON files instead of MongoDB.
func (a *App) storageMode() string {
	if a.mongoStore != nil {
		return "mongodb"
	}
	return "json-file"
}

func newMongoStore(uri string, databaseName string) (*MongoStore, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, fmt.Errorf("connect failed: %w", err)
	}
	if err := client.Ping(ctx, readpref.Primary()); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, fmt.Errorf("ping failed: %w", err)
	}

	database := client.Database(databaseName)
	store := &MongoStore{
		client:             client,
		database:           database,
		blogPosts:          database.Collection("blog_posts"),
		missions:           database.Collection("missions"),
		moduleState:        database.Collection("module_progress"),
		thmSnapshot:        database.Collection("thm_snapshot"),
		thmManualRooms:     database.Collection("thm_manual_rooms"),
		thmSkillCategories: database.Collection("thm_skill_categories"),
		repoOverrides:      database.Collection("repo_overrides"),
		images:             database.Collection("images"),
		siteProfile:        database.Collection("site_profile"),
	}

	if err := store.ensureIndexes(ctx); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, err
	}

	return store, nil
}

func (m *MongoStore) ensureIndexes(ctx context.Context) error {
	unique := options.Index().SetUnique(true)

	if _, err := m.blogPosts.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "id", Value: 1}},
		Options: unique,
	}); err != nil {
		return fmt.Errorf("blog index failed: %w", err)
	}

	if _, err := m.missions.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "id", Value: 1}},
		Options: unique,
	}); err != nil {
		return fmt.Errorf("mission index failed: %w", err)
	}

	if _, err := m.images.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "id", Value: 1}},
		Options: unique,
	}); err != nil {
		return fmt.Errorf("image index failed: %w", err)
	}

	if _, err := m.moduleState.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "moduleCode", Value: 1}},
		Options: unique,
	}); err != nil {
		return fmt.Errorf("module index failed: %w", err)
	}

	return nil
}

func (m *MongoStore) LoadBlogPosts() ([]BlogPost, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	cursor, err := m.blogPosts.Find(
		ctx,
		bson.D{},
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(500),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var posts []BlogPost
	if err := cursor.All(ctx, &posts); err != nil {
		return nil, err
	}
	if posts == nil {
		posts = []BlogPost{}
	}
	return posts, nil
}

func (m *MongoStore) DeleteBlogPost(id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_, err := m.blogPosts.DeleteOne(ctx, bson.M{"id": id})
	return err
}

func (m *MongoStore) UpsertBlogPost(post BlogPost) error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	// Replace rather than $set so a cleared image (omitempty) is actually
	// removed from the stored document.
	_, err := m.blogPosts.ReplaceOne(
		ctx,
		bson.M{"id": post.ID},
		post,
		options.Replace().SetUpsert(true),
	)
	return err
}

func (m *MongoStore) LoadMissions() ([]MissionItem, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	cursor, err := m.missions.Find(
		ctx,
		bson.D{},
		options.Find().SetSort(bson.D{{Key: "updatedAt", Value: -1}}).SetLimit(2000),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var missions []MissionItem
	if err := cursor.All(ctx, &missions); err != nil {
		return nil, err
	}
	if missions == nil {
		missions = []MissionItem{}
	}
	return missions, nil
}

func (m *MongoStore) UpsertMission(mission MissionItem) error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_, err := m.missions.UpdateOne(
		ctx,
		bson.M{"id": mission.ID},
		bson.M{"$set": mission},
		options.Update().SetUpsert(true),
	)
	return err
}

func (m *MongoStore) DeleteMission(id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_, err := m.missions.DeleteOne(ctx, bson.M{"id": id})
	return err
}

func (m *MongoStore) LoadModuleProgress() (map[string]ModuleProgress, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	cursor, err := m.moduleState.Find(ctx, bson.D{}, options.Find().SetLimit(200))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	type moduleDoc struct {
		ModuleCode string         `bson:"moduleCode"`
		Progress   ModuleProgress `bson:"progress"`
	}

	var docs []moduleDoc
	if err := cursor.All(ctx, &docs); err != nil {
		return nil, err
	}

	out := map[string]ModuleProgress{}
	for _, doc := range docs {
		code := doc.ModuleCode
		if code == "" {
			continue
		}
		if doc.Progress.Marks == nil {
			doc.Progress.Marks = map[string]float64{}
		}
		out[code] = doc.Progress
	}
	return out, nil
}

func (m *MongoStore) UpsertModuleProgress(moduleCode string, progress ModuleProgress) error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_, err := m.moduleState.UpdateOne(
		ctx,
		bson.M{"moduleCode": moduleCode},
		bson.M{"$set": bson.M{
			"moduleCode": moduleCode,
			"progress":   progress,
		}},
		options.Update().SetUpsert(true),
	)
	return err
}
