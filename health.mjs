import {getStore} from "@netlify/blobs";
export default async()=>Response.json({gemini:!!process.env.GEMINI_API_KEY,storage:!!process.env.NETLIFY_BLOBS_CONTEXT});
export const config={path:"/api/health"};