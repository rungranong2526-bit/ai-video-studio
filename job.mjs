import {GoogleGenAI} from "@google/genai";
import {getStore} from "@netlify/blobs";
import {loadJSON,saveJSON} from "./_store.mjs";
export default async(req)=>{
 try{
  const id=new URL(req.url).searchParams.get("id");let job=await loadJSON(`job/${id}`);
  if(!job)return Response.json({error:"ไม่พบ Job"},{status:404});
  if(job.status!=="done"&&job.operation){
   const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
   const op=await ai.operations.get({name:job.operation});
   if(op.done){
    if(op.error){job.status="error";job.message=JSON.stringify(op.error)}
    else{
      const v=op.response?.generatedVideos?.[0]?.video;
      if(v){
        // Download bytes from the provider and persist them in Netlify Blobs.
        const store=getStore("ai-video-studio");
        const buf=await v.videoBytes;
        if(buf){
          const key=`videos/${id}.mp4`;await store.set(key,buf,{metadata:{contentType:"video/mp4"}});
          job.video_key=key;job.status="done";job.progress=100;job.message="สร้างวิดีโอเสร็จแล้ว";job.video_url=`/.netlify/functions/download?id=${encodeURIComponent(id)}`;
        }else{job.status="done";job.progress=100;job.message="สร้างเสร็จ แต่ต้องจัดเก็บผลลัพธ์ผ่าน provider URI"}
      }
    }
    await saveJSON(`job/${id}`,job);
   }else{job.progress=Math.min(95,(job.progress||20)+5);job.message="Veo กำลังประมวลผล";await saveJSON(`job/${id}`,job)}
  }
  return Response.json(job);
 }catch(e){return Response.json({error:e.message},{status:500})}
};
export const config={path:"/api/job"};