import {GoogleGenAI} from "@google/genai";
import {loadJSON,saveJSON} from "./_store.mjs";
export default async(req)=>{
 try{
  const {job_id}=await req.json(); const job=await loadJSON(`job/${job_id}`);
  if(!job)return Response.json({error:"ไม่พบงาน"},{status:404});
  job.status="generating";job.progress=10;job.message="กำลังสร้างด้วย Veo";await saveJSON(`job/${job_id}`,job);
  const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
  const op=await ai.models.generateVideos({model:process.env.VEO_MODEL||"veo-3.1-generate-preview",prompt:job.visual_prompt,config:{aspectRatio:"9:16",resolution:"720p",numberOfVideos:1}});
  job.operation=op.name;job.progress=20;await saveJSON(`job/${job_id}`,job);
  return Response.json({ok:true});
 }catch(e){return Response.json({error:e.message},{status:500})}
};
export const config={path:"/api/start-video",method:["POST"]};