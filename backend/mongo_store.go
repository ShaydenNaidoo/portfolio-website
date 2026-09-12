package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
)

type MongoStore struct {
	client      *mongo.Client
	database    *mongo.Database
	blogPosts   *mongo.Collection
	missions    *mongo.Collection
	moduleState *mongo.Collection
	thmSnapshot *mongo.Collection
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

	store, err := newMongoStore(uri, databaseName)
	if err != nil {
		fmt.Printf("MongoDB init failed (fallback to JSON storage): %v\n", err)
		return
	}
	a.mongoStore = store
	fmt.Printf("MongoDB storage enabled (database=%s)\n", databaseName)
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
		client:      client,
		database:    database,
		blogPosts:   database.Collection("blog_posts"),
		missions:    database.Collection("missions"),
		moduleState: database.Collection("module_progress"),
		thmSnapshot: database.Collection("thm_snapshot"),
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

func (m *MongoStore) UpsertBlogPost(post BlogPost) error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	_, err := m.blogPosts.UpdateOne(
		ctx,
		bson.M{"id": post.ID},
		bson.M{"$set": post},
		options.Update().SetUpsert(true),
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
