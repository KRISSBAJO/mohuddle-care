/* The phone app's Speak your note: the same route as the website, under /api/v1. Send ?encoded=1 with an m4a. */
export { POST } from "@/app/api/scribe/transcribe/route";
export const runtime = "nodejs";
export const maxDuration = 300;
