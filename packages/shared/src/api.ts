import { z } from "zod";
import type { KnowledgeSourceStatus, KnowledgeSourceType, MessageRole } from "./enums";
import {
  KNOWLEDGE_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_MESSAGE_LENGTH,
  MAX_PASTED_TEXT_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  MAX_TITLE_LENGTH,
} from "./limits";
import type { Plan } from "./plans";
import { widgetConfigSchema } from "./widget";
import type { WidgetConfig } from "./widget";

const id = z.uuid();
const projectName = z.string().trim().min(1).max(MAX_PROJECT_NAME_LENGTH);
const title = z.string().trim().min(1).max(MAX_TITLE_LENGTH);

/** Path param of the routes that take one `:id`. */
export const idParamSchema = z.object({ id });
export type IdParam = z.infer<typeof idParamSchema>;

export type OkResponse = { ok: true };

// ---- Public (widget) ----

/** GET /api/widget/config */
export const widgetConfigQuerySchema = z.object({ key: z.string().min(1).max(100) });
export type WidgetConfigQuery = z.infer<typeof widgetConfigQuerySchema>;
/** Plan-applied: Free gets the defaults and the badge. */
export type WidgetConfigResponse = WidgetConfig;

/** POST /api/widget/chat */
export const chatRequestSchema = z.object({
  key: z.string().min(1).max(100),
  visitorId: z.string().min(1).max(100),
  conversationId: id.optional(),
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = { conversationId: string; reply: string };

// ---- Owner ----

export type ProjectSummary = {
  id: string;
  name: string;
  publicKey: string;
  messagesUsed: number;
  periodStart: string;
  createdAt: string;
};

/** GET /api/projects */
export type ListProjectsResponse = { projects: ProjectSummary[]; plan: Plan };

/** POST /api/projects */
export const createProjectSchema = z.object({ name: projectName });
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateProjectResponse = { project: ProjectSummary };

/** PATCH /api/projects/:id (rename) */
export const renameProjectSchema = z.object({ name: projectName });
export type RenameProjectInput = z.infer<typeof renameProjectSchema>;
export type RenameProjectResponse = { project: ProjectSummary };

/** DELETE /api/projects/:id */
export type DeleteProjectResponse = OkResponse;

export type KnowledgeSourceSummary = {
  id: string;
  title: string;
  type: KnowledgeSourceType;
  status: KnowledgeSourceStatus;
  createdAt: string;
};

/** POST /api/projects/:id/knowledge (paste text) */
export const pasteKnowledgeSchema = z.object({
  title,
  content: z.string().trim().min(1).max(MAX_PASTED_TEXT_LENGTH),
});
export type PasteKnowledgeInput = z.infer<typeof pasteKnowledgeSchema>;
export type PasteKnowledgeResponse = { source: KnowledgeSourceSummary };

/** POST /api/projects/:id/knowledge/upload-url */
export const uploadUrlSchema = z.object({
  title,
  /** File extension, checked against the declared name server-side. */
  fileType: z.enum(KNOWLEDGE_FILE_TYPES),
  /** Declared size in bytes. */
  size: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
});
export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;
export type UploadUrlResponse = {
  source: KnowledgeSourceSummary;
  /** One-time signed upload URL. */
  uploadUrl: string;
};

/** POST /api/projects/:id/knowledge/finalize */
export const finalizeKnowledgeSchema = z.object({ sourceId: id });
export type FinalizeKnowledgeInput = z.infer<typeof finalizeKnowledgeSchema>;
export type FinalizeKnowledgeResponse = { source: KnowledgeSourceSummary };

/** DELETE /api/knowledge/:id */
export type DeleteKnowledgeResponse = OkResponse;

export type ConversationSummary = {
  id: string;
  visitorId: string;
  createdAt: string;
  messageCount: number;
};
export type ConversationMessage = {
  id: string;
  role: MessageRole;
  body: string;
  createdAt: string;
};

/** GET /api/projects/:id/conversations */
export type ListConversationsResponse = { conversations: ConversationSummary[] };

/** GET /api/conversations/:id */
export type GetConversationResponse = {
  conversation: ConversationSummary;
  messages: ConversationMessage[];
};

/** PATCH /api/projects/:id/config: any subset of the fields, at least one. */
export const updateConfigSchema = widgetConfigSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Send at least one field");
export type UpdateConfigInput = z.infer<typeof updateConfigSchema>;
export type UpdateConfigResponse = { config: WidgetConfig };

// ---- System ----

/** POST /api/clerk/webhook: Clerk's payload, so no input schema here. */
export type ClerkWebhookResponse = { received: true };

/** GET /api/posthog-config */
export type PosthogConfigResponse = { key: string; host: string };
