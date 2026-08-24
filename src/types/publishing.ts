// Types for the organic Facebook-groups publishing module (/publishing).
// Schema: supabase/migrations/00056_facebook_publishing.sql

export type PostStatus = "draft" | "ready" | "archived";
export type PublicationStatus = "queued" | "posted" | "skipped" | "removed";

export interface RoleTemplate {
  id: string;
  role_key: string;
  role_label: string;
  emoji: string | null;
  headline: string | null;
  body: string | null;
  requirements: string[];
  sort_order: number;
  is_active: boolean;
}

export interface FbGroup {
  id: string;
  owner_email: string;
  name: string;
  url: string;
  members: number | null;
  category: string | null;
  cooldown_hours: number;
  rules: string | null;
  requires_approval: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** A group plus the live numbers the queue needs. */
export interface GroupWithStats extends FbGroup {
  last_posted_at: string | null;
  posts_count: number;
  responses_total: number;
  /** null = free to post now; otherwise ISO time the cooldown expires */
  cooldown_until: string | null;
}

export interface FbPost {
  id: string;
  role_key: string | null;
  job_id: string | null;
  title: string;
  body: string;
  angle: string | null;
  status: PostStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FbVariant {
  id: string;
  post_id: string;
  body: string;
  label: string | null;
  times_used: number;
  created_at: string;
}

export interface FbPublication {
  id: string;
  post_id: string;
  group_id: string;
  variant_id: string | null;
  owner_email: string | null;
  body_snapshot: string;
  /** the link, pasted as the first comment under the post (null if no phone) */
  comment_snapshot: string | null;
  tracking_code: string;
  status: PublicationStatus;
  scheduled_for: string | null;
  posted_at: string | null;
  post_url: string | null;
  responses: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicationWithRefs extends FbPublication {
  fb_groups: Pick<FbGroup, "id" | "name" | "url" | "cooldown_hours" | "rules" | "requires_approval"> | null;
  fb_posts: Pick<FbPost, "id" | "title" | "role_key"> | null;
}

export interface PublishingSettings {
  id: number;
  contact_phone: string | null;
  contact_name: string | null;
  signature: string | null;
  updated_at: string;
}
