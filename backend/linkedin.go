package main

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// LinkedIn does not let ordinary apps read a member's posts (r_member_social
// is partner-only), so posts are imported by URL: the admin pastes a post
// link or LinkedIn's embed code, and the blog card renders LinkedIn's
// official embed for that post.

var (
	// https://www.linkedin.com/posts/<slug>-activity-7240000000000000000-abcd
	linkedInActivityInPath = regexp.MustCompile(`(?i)(?:activity|ugcPost|share)[-:](\d{15,25})`)
	// urn:li:activity:724..., urn:li:share:724..., urn:li:ugcPost:724...
	linkedInURN = regexp.MustCompile(`(?i)urn:li:(activity|share|ugcPost):(\d{15,25})`)
	// src="https://www.linkedin.com/embed/feed/update/urn:li:share:724..."
	linkedInEmbedSrc = regexp.MustCompile(`(?i)src="([^"]+)"`)
)

type linkedInRef struct {
	URL      string // canonical page link for "View on LinkedIn"
	EmbedURL string // iframe src for LinkedIn's official embed
}

// parseLinkedInPost accepts a post URL, a feed/update URL, a bare URN, or the
// <iframe> embed code from LinkedIn's "Embed this post" menu.
func parseLinkedInPost(raw string) (linkedInRef, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return linkedInRef{}, nil
	}
	candidate := raw
	if m := linkedInEmbedSrc.FindStringSubmatch(raw); m != nil {
		candidate = m[1]
	}

	kind, id := "", ""
	if m := linkedInURN.FindStringSubmatch(candidate); m != nil {
		kind, id = strings.ToLower(m[1]), m[2]
	} else if m := linkedInActivityInPath.FindStringSubmatch(candidate); m != nil {
		kind, id = "activity", m[1]
	}
	if id == "" {
		return linkedInRef{}, fmt.Errorf("could not find a LinkedIn post id in that link; paste the post URL (…/posts/…-activity-<id>-…) or its embed code")
	}
	switch kind {
	case "ugcpost":
		kind = "ugcPost"
	case "share", "activity":
	default:
		kind = "activity"
	}
	urn := fmt.Sprintf("urn:li:%s:%s", kind, id)

	pageURL := ""
	if u, err := url.Parse(candidate); err == nil && strings.HasSuffix(strings.ToLower(u.Host), "linkedin.com") && !strings.Contains(u.Path, "/embed/") {
		u.RawQuery = ""
		u.Fragment = ""
		pageURL = u.String()
	}
	if pageURL == "" {
		pageURL = "https://www.linkedin.com/feed/update/" + urn + "/"
	}
	return linkedInRef{
		URL:      pageURL,
		EmbedURL: "https://www.linkedin.com/embed/feed/update/" + urn,
	}, nil
}
