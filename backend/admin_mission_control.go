package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"
)

const missionControlDataFile = "data/admin_mission_control.json"

type MissionType string

const (
	MissionTypeDaily      MissionType = "daily"
	MissionTypeStudy      MissionType = "study"
	MissionTypeAssignment MissionType = "assignment"
	MissionTypeTest       MissionType = "test"
	MissionTypeExam       MissionType = "exam"
	MissionTypeDeadline   MissionType = "deadline"
)

type MissionPriority string

const (
	MissionPriorityLow    MissionPriority = "low"
	MissionPriorityMedium MissionPriority = "medium"
	MissionPriorityHigh   MissionPriority = "high"
)

type MissionControlStore struct {
	Missions  []MissionItem             `json:"missions"`
	Modules   map[string]ModuleProgress `json:"modules"`
	UpdatedAt string                    `json:"updatedAt"`
}

type MissionItem struct {
	ID          string          `json:"id" bson:"id"`
	Title       string          `json:"title" bson:"title"`
	Description string          `json:"description,omitempty" bson:"description,omitempty"`
	Type        MissionType     `json:"type" bson:"type"`
	Priority    MissionPriority `json:"priority" bson:"priority"`
	DueDate     string          `json:"dueDate,omitempty" bson:"dueDate,omitempty"`
	ModuleCode  string          `json:"moduleCode,omitempty" bson:"moduleCode,omitempty"`
	Completed   bool            `json:"completed" bson:"completed"`
	CreatedAt   string          `json:"createdAt" bson:"createdAt"`
	UpdatedAt   string          `json:"updatedAt" bson:"updatedAt"`
}

type ModuleProgress struct {
	Marks     map[string]float64 `json:"marks" bson:"marks"`
	ExamMark  *float64           `json:"examMark,omitempty" bson:"examMark,omitempty"`
	UpdatedAt string             `json:"updatedAt,omitempty" bson:"updatedAt,omitempty"`
}

type AssessmentComponent struct {
	Key         string  `json:"key"`
	Label       string  `json:"label"`
	Weight      float64 `json:"weight"`
	Description string  `json:"description,omitempty"`
}

type ModuleDefinition struct {
	Code           string                `json:"code"`
	Name           string                `json:"name"`
	SemesterWeight float64               `json:"semesterWeight"`
	ExamWeight     float64               `json:"examWeight"`
	Source         string                `json:"source"`
	Components     []AssessmentComponent `json:"components"`
	Rules          []string              `json:"rules"`
}

type ModuleMetrics struct {
	SemesterMark           float64  `json:"semesterMark"`
	SemesterCoverage       float64  `json:"semesterCoverage"`
	EnteredSemesterAverage *float64 `json:"enteredSemesterAverage,omitempty"`
	FinalMark              *float64 `json:"finalMark,omitempty"`
	RequiredExamForPass    *float64 `json:"requiredExamForPass,omitempty"`
	CanStillPass           bool     `json:"canStillPass"`
}

type ModuleView struct {
	Definition ModuleDefinition `json:"definition"`
	Progress   ModuleProgress   `json:"progress"`
	Metrics    ModuleMetrics    `json:"metrics"`
}

type MissionControlResponse struct {
	Today     string        `json:"today"`
	Generated string        `json:"generatedAt"`
	Missions  []MissionItem `json:"missions"`
	Modules   []ModuleView  `json:"modules"`
}

type missionInput struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Type        string `json:"type"`
	Priority    string `json:"priority"`
	DueDate     string `json:"dueDate"`
	ModuleCode  string `json:"moduleCode"`
	Completed   bool   `json:"completed"`
}

type moduleProgressInput struct {
	Marks    map[string]float64 `json:"marks"`
	ExamMark *float64           `json:"examMark"`
}

func (a *App) loadMissionControl() {
	store := MissionControlStore{
		Missions: []MissionItem{},
		Modules:  map[string]ModuleProgress{},
	}
	b, err := os.ReadFile(missionControlDataFile)
	if err == nil {
		if err := json.Unmarshal(b, &store); err != nil {
			store = MissionControlStore{
				Missions: []MissionItem{},
				Modules:  map[string]ModuleProgress{},
			}
		}
	}
	if store.Modules == nil {
		store.Modules = map[string]ModuleProgress{}
	}
	if a.mongoStore != nil {
		missions, err := a.mongoStore.LoadMissions()
		if err != nil {
			fmt.Printf("Mongo mission load failed, using JSON fallback: %v\n", err)
		} else {
			store.Missions = missions
		}
		moduleState, err := a.mongoStore.LoadModuleProgress()
		if err != nil {
			fmt.Printf("Mongo module progress load failed, using JSON fallback: %v\n", err)
		} else if len(moduleState) > 0 {
			store.Modules = moduleState
		}
	}
	a.missionControl = store
}

func (a *App) saveMissionControlLocked() error {
	a.missionControl.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	b, err := json.MarshalIndent(a.missionControl, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(missionControlDataFile, b, 0o644)
}

func (a *App) handleAdminMissionControl(w http.ResponseWriter, r *http.Request) {
	if !a.isAuthorizedAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	a.mu.RLock()
	defer a.mu.RUnlock()
	respondJSON(w, a.buildMissionControlResponseLocked(time.Now().UTC()))
}

func (a *App) handleAdminMissionControlSubroute(w http.ResponseWriter, r *http.Request) {
	if !a.isAuthorizedAdmin(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/admin/mission-control/")
	path = strings.TrimSpace(path)
	if path == "" {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	if path == "mission" {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		a.handleCreateMission(w, r)
		return
	}

	if strings.HasPrefix(path, "mission/") {
		id := strings.TrimSpace(strings.TrimPrefix(path, "mission/"))
		if id == "" {
			http.Error(w, "mission id required", http.StatusBadRequest)
			return
		}
		switch r.Method {
		case http.MethodPut:
			a.handleUpdateMission(w, r, id)
			return
		case http.MethodDelete:
			a.handleDeleteMission(w, r, id)
			return
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
	}

	if strings.HasPrefix(path, "module/") {
		if r.Method != http.MethodPut {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		code := strings.ToUpper(strings.TrimSpace(strings.TrimPrefix(path, "module/")))
		if code == "" {
			http.Error(w, "module code required", http.StatusBadRequest)
			return
		}
		a.handleUpdateModuleProgress(w, r, code)
		return
	}

	http.Error(w, "not found", http.StatusNotFound)
}

func (a *App) handleCreateMission(w http.ResponseWriter, r *http.Request) {
	var in missionInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	mission, err := normalizeMissionInput(in, now, "")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	moduleByCode := moduleDefinitionByCode()
	if mission.ModuleCode != "" {
		if _, ok := moduleByCode[mission.ModuleCode]; !ok {
			http.Error(w, "unknown module code", http.StatusBadRequest)
			return
		}
	}

	idToken, err := newSessionToken()
	if err != nil {
		http.Error(w, "failed to generate mission id", http.StatusInternalServerError)
		return
	}
	mission.ID = "mission-" + idToken[:10]
	if a.mongoStore != nil {
		if err := a.mongoStore.UpsertMission(mission); err != nil {
			http.Error(w, "failed to save mission", http.StatusInternalServerError)
			return
		}
	}

	a.mu.Lock()
	a.missionControl.Missions = append(a.missionControl.Missions, mission)
	sortMissionsInPlace(a.missionControl.Missions)
	if err := a.saveMissionControlLocked(); err != nil {
		a.mu.Unlock()
		http.Error(w, "failed to save mission", http.StatusInternalServerError)
		return
	}
	resp := a.buildMissionControlResponseLocked(now)
	a.mu.Unlock()

	respondJSON(w, map[string]any{
		"status":  "created",
		"mission": mission,
		"data":    resp,
	})
}

func (a *App) handleUpdateMission(w http.ResponseWriter, r *http.Request, id string) {
	var in missionInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	mission, err := normalizeMissionInput(in, now, id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	moduleByCode := moduleDefinitionByCode()
	if mission.ModuleCode != "" {
		if _, ok := moduleByCode[mission.ModuleCode]; !ok {
			http.Error(w, "unknown module code", http.StatusBadRequest)
			return
		}
	}

	a.mu.Lock()
	index := -1
	for i := range a.missionControl.Missions {
		if a.missionControl.Missions[i].ID == id {
			index = i
			break
		}
	}
	if index == -1 {
		a.mu.Unlock()
		http.Error(w, "mission not found", http.StatusNotFound)
		return
	}

	mission.CreatedAt = a.missionControl.Missions[index].CreatedAt
	if a.mongoStore != nil {
		if err := a.mongoStore.UpsertMission(mission); err != nil {
			a.mu.Unlock()
			http.Error(w, "failed to save mission", http.StatusInternalServerError)
			return
		}
	}
	a.missionControl.Missions[index] = mission
	sortMissionsInPlace(a.missionControl.Missions)

	if err := a.saveMissionControlLocked(); err != nil {
		a.mu.Unlock()
		http.Error(w, "failed to save mission", http.StatusInternalServerError)
		return
	}
	resp := a.buildMissionControlResponseLocked(now)
	a.mu.Unlock()

	respondJSON(w, map[string]any{
		"status":  "updated",
		"mission": mission,
		"data":    resp,
	})
}

func (a *App) handleDeleteMission(w http.ResponseWriter, _ *http.Request, id string) {
	now := time.Now().UTC()

	a.mu.Lock()
	index := -1
	for i := range a.missionControl.Missions {
		if a.missionControl.Missions[i].ID == id {
			index = i
			break
		}
	}
	if index == -1 {
		a.mu.Unlock()
		http.Error(w, "mission not found", http.StatusNotFound)
		return
	}
	if a.mongoStore != nil {
		if err := a.mongoStore.DeleteMission(id); err != nil {
			a.mu.Unlock()
			http.Error(w, "failed to delete mission", http.StatusInternalServerError)
			return
		}
	}
	a.missionControl.Missions = append(a.missionControl.Missions[:index], a.missionControl.Missions[index+1:]...)
	if err := a.saveMissionControlLocked(); err != nil {
		a.mu.Unlock()
		http.Error(w, "failed to delete mission", http.StatusInternalServerError)
		return
	}
	resp := a.buildMissionControlResponseLocked(now)
	a.mu.Unlock()

	respondJSON(w, map[string]any{
		"status": "deleted",
		"data":   resp,
	})
}

func (a *App) handleUpdateModuleProgress(w http.ResponseWriter, r *http.Request, moduleCode string) {
	defByCode := moduleDefinitionByCode()
	definition, ok := defByCode[moduleCode]
	if !ok {
		http.Error(w, "unknown module code", http.StatusBadRequest)
		return
	}

	var in moduleProgressInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	componentByKey := map[string]AssessmentComponent{}
	for _, component := range definition.Components {
		componentByKey[component.Key] = component
	}

	normalizedMarks := map[string]float64{}
	for key, value := range in.Marks {
		normalizedKey := strings.TrimSpace(key)
		if normalizedKey == "" {
			continue
		}
		if _, ok := componentByKey[normalizedKey]; !ok {
			http.Error(w, fmt.Sprintf("unknown assessment key: %s", normalizedKey), http.StatusBadRequest)
			return
		}
		if value < 0 || value > 100 {
			http.Error(w, fmt.Sprintf("mark for %s must be between 0 and 100", normalizedKey), http.StatusBadRequest)
			return
		}
		normalizedMarks[normalizedKey] = roundToTwo(value)
	}

	var examMark *float64
	if in.ExamMark != nil {
		if *in.ExamMark < 0 || *in.ExamMark > 100 {
			http.Error(w, "exam mark must be between 0 and 100", http.StatusBadRequest)
			return
		}
		mark := roundToTwo(*in.ExamMark)
		examMark = &mark
	}

	now := time.Now().UTC()
	progress := ModuleProgress{
		Marks:     normalizedMarks,
		ExamMark:  examMark,
		UpdatedAt: now.Format(time.RFC3339),
	}

	a.mu.Lock()
	if a.missionControl.Modules == nil {
		a.missionControl.Modules = map[string]ModuleProgress{}
	}
	if a.mongoStore != nil {
		if err := a.mongoStore.UpsertModuleProgress(moduleCode, progress); err != nil {
			a.mu.Unlock()
			http.Error(w, "failed to save module progress", http.StatusInternalServerError)
			return
		}
	}
	a.missionControl.Modules[moduleCode] = progress
	if err := a.saveMissionControlLocked(); err != nil {
		a.mu.Unlock()
		http.Error(w, "failed to save module progress", http.StatusInternalServerError)
		return
	}
	resp := a.buildMissionControlResponseLocked(now)
	a.mu.Unlock()

	respondJSON(w, map[string]any{
		"status":   "updated",
		"module":   moduleCode,
		"progress": progress,
		"data":     resp,
	})
}

func normalizeMissionInput(input missionInput, now time.Time, existingID string) (MissionItem, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return MissionItem{}, fmt.Errorf("mission title is required")
	}
	if utf8Len(title) > 140 {
		return MissionItem{}, fmt.Errorf("mission title must be 140 characters or fewer")
	}

	description := strings.TrimSpace(input.Description)
	if utf8Len(description) > 500 {
		return MissionItem{}, fmt.Errorf("mission description must be 500 characters or fewer")
	}

	missionType := MissionType(strings.ToLower(strings.TrimSpace(input.Type)))
	if missionType == "" {
		missionType = MissionTypeDaily
	}
	if !isAllowedMissionType(missionType) {
		return MissionItem{}, fmt.Errorf("invalid mission type")
	}

	priority := MissionPriority(strings.ToLower(strings.TrimSpace(input.Priority)))
	if priority == "" {
		priority = MissionPriorityMedium
	}
	if !isAllowedMissionPriority(priority) {
		return MissionItem{}, fmt.Errorf("invalid mission priority")
	}

	dueDate := strings.TrimSpace(input.DueDate)
	if dueDate != "" {
		parsed, err := time.Parse("2006-01-02", dueDate)
		if err != nil {
			return MissionItem{}, fmt.Errorf("dueDate must be in YYYY-MM-DD format")
		}
		dueDate = parsed.Format("2006-01-02")
	}

	moduleCode := strings.ToUpper(strings.TrimSpace(input.ModuleCode))
	if utf8Len(moduleCode) > 24 {
		return MissionItem{}, fmt.Errorf("module code is too long")
	}

	nowISO := now.Format(time.RFC3339)
	return MissionItem{
		ID:          existingID,
		Title:       title,
		Description: description,
		Type:        missionType,
		Priority:    priority,
		DueDate:     dueDate,
		ModuleCode:  moduleCode,
		Completed:   input.Completed,
		CreatedAt:   nowISO,
		UpdatedAt:   nowISO,
	}, nil
}

func isAllowedMissionType(missionType MissionType) bool {
	switch missionType {
	case MissionTypeDaily, MissionTypeStudy, MissionTypeAssignment, MissionTypeTest, MissionTypeExam, MissionTypeDeadline:
		return true
	default:
		return false
	}
}

func isAllowedMissionPriority(priority MissionPriority) bool {
	switch priority {
	case MissionPriorityLow, MissionPriorityMedium, MissionPriorityHigh:
		return true
	default:
		return false
	}
}

func (a *App) buildMissionControlResponseLocked(now time.Time) MissionControlResponse {
	moduleDefs := moduleDefinitionsFromStudyGuides()
	moduleViews := make([]ModuleView, 0, len(moduleDefs))

	moduleProgress := a.missionControl.Modules
	if moduleProgress == nil {
		moduleProgress = map[string]ModuleProgress{}
	}

	for _, definition := range moduleDefs {
		progress := moduleProgress[definition.Code]
		if progress.Marks == nil {
			progress.Marks = map[string]float64{}
		}
		moduleViews = append(moduleViews, ModuleView{
			Definition: definition,
			Progress:   progress,
			Metrics:    computeModuleMetrics(definition, progress),
		})
	}

	missions := make([]MissionItem, 0, len(a.missionControl.Missions))
	for _, mission := range a.missionControl.Missions {
		missions = append(missions, mission)
	}
	sortMissionsInPlace(missions)

	return MissionControlResponse{
		Today:     now.Format("2006-01-02"),
		Generated: now.Format(time.RFC3339),
		Missions:  missions,
		Modules:   moduleViews,
	}
}

func sortMissionsInPlace(missions []MissionItem) {
	sort.SliceStable(missions, func(i, j int) bool {
		left := missions[i]
		right := missions[j]
		leftHasDate := left.DueDate != ""
		rightHasDate := right.DueDate != ""

		if left.Completed != right.Completed {
			return !left.Completed
		}
		if leftHasDate != rightHasDate {
			return leftHasDate
		}
		if leftHasDate && rightHasDate && left.DueDate != right.DueDate {
			return left.DueDate < right.DueDate
		}

		leftPriority := missionPriorityOrder(left.Priority)
		rightPriority := missionPriorityOrder(right.Priority)
		if leftPriority != rightPriority {
			return leftPriority < rightPriority
		}

		if left.UpdatedAt != right.UpdatedAt {
			return left.UpdatedAt > right.UpdatedAt
		}
		return left.Title < right.Title
	})
}

func missionPriorityOrder(priority MissionPriority) int {
	switch priority {
	case MissionPriorityHigh:
		return 1
	case MissionPriorityMedium:
		return 2
	case MissionPriorityLow:
		return 3
	default:
		return 4
	}
}

func computeModuleMetrics(definition ModuleDefinition, progress ModuleProgress) ModuleMetrics {
	semesterMark := 0.0
	coverage := 0.0
	for _, component := range definition.Components {
		mark, ok := progress.Marks[component.Key]
		if !ok {
			continue
		}
		if mark < 0 {
			mark = 0
		}
		if mark > 100 {
			mark = 100
		}
		semesterMark += mark * (component.Weight / 100.0)
		coverage += component.Weight
	}
	semesterMark = roundToTwo(semesterMark)
	coverage = roundToTwo(coverage)

	var enteredAverage *float64
	if coverage > 0 {
		avg := roundToTwo(semesterMark / (coverage / 100.0))
		enteredAverage = &avg
	}

	var finalMark *float64
	if progress.ExamMark != nil {
		mark := *progress.ExamMark
		if mark < 0 {
			mark = 0
		}
		if mark > 100 {
			mark = 100
		}
		calculated := roundToTwo((semesterMark * (definition.SemesterWeight / 100.0)) + (mark * (definition.ExamWeight / 100.0)))
		finalMark = &calculated
	}

	var requiredExamForPass *float64
	canStillPass := true
	if definition.ExamWeight > 0 {
		required := (50.0 - (semesterMark * (definition.SemesterWeight / 100.0))) / (definition.ExamWeight / 100.0)
		if required < 0 {
			required = 0
		}
		if required > 100 {
			canStillPass = false
		}
		value := roundToTwo(required)
		requiredExamForPass = &value
	}

	return ModuleMetrics{
		SemesterMark:           semesterMark,
		SemesterCoverage:       coverage,
		EnteredSemesterAverage: enteredAverage,
		FinalMark:              finalMark,
		RequiredExamForPass:    requiredExamForPass,
		CanStillPass:           canStillPass,
	}
}

func roundToTwo(value float64) float64 {
	return float64(int((value*100.0)+0.5)) / 100.0
}

func moduleDefinitionByCode() map[string]ModuleDefinition {
	out := map[string]ModuleDefinition{}
	for _, definition := range moduleDefinitionsFromStudyGuides() {
		out[definition.Code] = definition
	}
	return out
}

func moduleDefinitionsFromStudyGuides() []ModuleDefinition {
	return []ModuleDefinition{
		{
			Code:           "COS314",
			Name:           "Artificial Intelligence",
			SemesterWeight: 50,
			ExamWeight:     50,
			Source:         "COS314-study_guide_2026.pdf",
			Components: []AssessmentComponent{
				{
					Key:         "tests-average",
					Label:       "Semester Tests Average",
					Weight:      70,
					Description: "Study guide: Semester mark = 0.7 x test average + 0.3 x assignments.",
				},
				{
					Key:         "assignments-average",
					Label:       "Assignments Average",
					Weight:      30,
					Description: "Average over Assignment 1-3.",
				},
			},
			Rules: []string{
				"Exam entrance requires semester mark >= 40%.",
				"Pass requires exam mark >= 40% and final mark >= 50%.",
				"Distinction requires final mark >= 75%.",
			},
		},
		{
			Code:           "COS344",
			Name:           "Computer Graphics",
			SemesterWeight: 60,
			ExamWeight:     40,
			Source:         "COS344_Study_Guide_2026 (1).pdf",
			Components: []AssessmentComponent{
				{
					Key:         "practicals",
					Label:       "Practicals",
					Weight:      30,
					Description: "All four practicals contribute equally.",
				},
				{
					Key:         "class-tests",
					Label:       "Class Tests",
					Weight:      10,
					Description: "Best 4 of 5 class tests.",
				},
				{
					Key:         "homework-assignment",
					Label:       "Homework Assignment",
					Weight:      30,
					Description: "Singular semester homework assignment.",
				},
				{
					Key:         "semester-tests",
					Label:       "Semester Tests",
					Weight:      30,
					Description: "Only the best semester test counts.",
				},
			},
			Rules: []string{
				"Exam entrance requires semester mark >= 40%.",
				"Pass requires exam mark >= 40% and final mark >= 50%.",
				"Distinction requires final mark >= 75%.",
			},
		},
		{
			Code:           "COS333",
			Name:           "Programming Languages",
			SemesterWeight: 50,
			ExamWeight:     50,
			Source:         "COS333_study_guide.pdf",
			Components: []AssessmentComponent{
				{
					Key:         "semester-test-1",
					Label:       "Semester Test 1",
					Weight:      40,
					Description: "Part of semester-test component.",
				},
				{
					Key:         "semester-test-2",
					Label:       "Semester Test 2",
					Weight:      40,
					Description: "Part of semester-test component.",
				},
				{
					Key:         "practicals",
					Label:       "Practicals Average",
					Weight:      20,
					Description: "All seven practicals count equally.",
				},
			},
			Rules: []string{
				"Exam entrance requires semester mark >= 40%.",
				"Pass requires exam mark >= 40% and final mark >= 50%.",
				"Distinction requires final mark >= 75%.",
			},
		},
		{
			Code:           "PHY131",
			Name:           "General Physics 131",
			SemesterWeight: 60,
			ExamWeight:     40,
			Source:         "PHY131_2026_Study Guide-With Learning Objectives(1).pdf",
			Components: []AssessmentComponent{
				{
					Key:         "semester-tests",
					Label:       "Semester Tests",
					Weight:      50,
					Description: "Combined semester-test contribution.",
				},
				{
					Key:         "unit-tests",
					Label:       "Unit Tests (Connect)",
					Weight:      10,
					Description: "Unit tests on Connect.",
				},
				{
					Key:         "tutorial-tests",
					Label:       "Tutorial Tests",
					Weight:      15,
					Description: "Average of tutorial tests.",
				},
				{
					Key:         "laboratory-work",
					Label:       "Laboratory Work",
					Weight:      20,
					Description: "Lab contribution to semester mark.",
				},
				{
					Key:         "participation",
					Label:       "Participation (LearnSmart)",
					Weight:      5,
					Description: "Participation/LearnSmart assignments.",
				},
			},
			Rules: []string{
				"Exam entrance requires semester mark >= 40% and practical mark >= 50%.",
				"Pass requires exam mark >= 40% and final mark >= 50%.",
				"Distinction requires final mark >= 75%.",
			},
		},
	}
}
