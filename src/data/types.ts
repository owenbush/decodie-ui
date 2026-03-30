// Types matching the JSON schemas in schema/

export interface Reference {
  file: string;
  anchor: string;
  anchor_hash: string;
}

export interface ExternalDoc {
  label: string;
  url: string;
}

export interface IndexEntry {
  id: string;
  title: string;
  experience_level: 'foundational' | 'intermediate' | 'advanced' | 'ecosystem';
  topics: string[];
  decision_type: 'explanation' | 'rationale' | 'pattern' | 'warning' | 'convention';
  session_id: string;
  timestamp: string;
  lifecycle: 'active' | 'archived' | 'superseded';
  references: Reference[];
  external_docs: ExternalDoc[];
  cross_references: string[];
  content_file: string;
  superseded_by: string | null;
  // Allow additional properties as schema permits
  [key: string]: unknown;
}

export interface LearningIndex {
  version: string;
  project: string;
  entries: IndexEntry[];
}

export interface SessionEntry {
  id: string;
  title: string;
  code_snippet: string;
  explanation: string;
  alternatives_considered: string;
  key_concepts: string[];
}

export interface SessionFile {
  session_id: string;
  timestamp_start: string;
  timestamp_end: string | null;
  summary: string;
  entries: SessionEntry[];
}

export interface Config {
  user_experience_level: 'foundational' | 'intermediate' | 'advanced' | 'ecosystem';
  preferred_topics: string[];
  excluded_topics: string[];
  archival_threshold_days: number;
  auto_suggest_archival: boolean;
  show_external_docs: boolean;
  default_view: 'all' | 'active' | 'session';
  sessions_visible_by_default: number;
  api_key: string | null;
  api_model: string | null;
}

export type ResolvedStatus = 'resolved' | 'drifted' | 'fuzzy' | 'stale';

export interface ReferenceResolution {
  reference: Reference;
  status: ResolvedStatus;
  resolved_file?: string;
  resolved_line?: number;
  confidence: number;
  message: string;
}

/** Index entry augmented with reference resolution info */
export interface IndexEntryWithResolution extends IndexEntry {
  reference_resolutions: ReferenceResolution[];
}

/** Full entry merging index metadata with session content */
export interface FullEntry extends IndexEntry {
  code_snippet?: string;
  explanation?: string;
  alternatives_considered?: string;
  key_concepts?: string[];
  reference_resolutions: ReferenceResolution[];
}
