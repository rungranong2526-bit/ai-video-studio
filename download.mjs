import {getStore} from "@netlify/blobs";
import {loadJSON} from "./_store.mjs";
export default async(req)=>{
 try{const id=new URL(req.url).searchParams.get("id");const j=await loadJSON(`job/${id}`);if(!j?.video_key)return new Response("Not found",{status:404});const s=getStore("ai-video-studio");const b=await s.get(j.video_key,{type:"arrayBuffer"});if(!b)return new Response("Not found",{status:404});return new Response(b,{headers:{"content-type":"video/mp4","content-disposition":`inline; filename="${id}.mp4"`,"cache-control":"private, max-age=3600"}})}catch(e){return new Response(e.message,{status:500})}
};
export const config={path:"/api/download"};