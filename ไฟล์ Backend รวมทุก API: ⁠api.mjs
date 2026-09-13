import {GoogleGenAI} from "@google/genai";
import {getStore} from "@netlify/blobs";

function store(){ return getStore("ai-video-studio"); }
async function saveJSON(key,obj){await store().setJSON(key,obj)}
async function loadJSON(key){return await store().get(key,{type:"json"})}

export default async(req)=>{
  try {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // 1. /api/health
    if (path.endsWith("/api/health") || path === "/api/health") {
      return Response.json({
        gemini: !!process.env.GEMINI_API_KEY,
        storage: !!process.env.NETLIFY_BLOBS_CONTEXT
      });
    }

    // 2. /api/upload
    if (path.endsWith("/api/upload")) {
      if (method !== "POST") return Response.json({error:"POST only"},{status:405});
      const form = await req.formData(); 
      const file = form.get("file");
      if (!file) return Response.json({error:"ไม่มีไฟล์"}, {status:400});
      if (file.size > 8_000_000) return Response.json({error:"ไฟล์ใหญ่เกิน 8MB"}, {status:413});
      const id = crypto.randomUUID() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
      await store().set(id, await file.arrayBuffer(), {metadata:{contentType:file.type}});
      return Response.json({id});
    }

    // 3. /api/create-project
    if (path.endsWith("/api/create-project")) {
      if (!process.env.GEMINI_API_KEY) return Response.json({error:"ตั้ง GEMINI_API_KEY ใน Netlify ก่อน"},{status:500});
      const d = await req.json(); 
      const count = Math.min(Math.max(+d.count||3,1),3);
      const ai = new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
      
      const prompt = `คุณเป็นผู้เชี่ยวชาญด้านการตลาดและการทำคอนเทนต์คลิปสั้น (TikTok/Shopee Video/Reels) มืออาชีพ
สินค้า: ${d.product}
ลิงก์: ${d.link||"ไม่มี"}
มุมขาย / จุดเด่น: ${d.angle}
จำนวนคลิปที่ต้องการ: ${count} คลิป (แต่ละคลิปมีความยาวประมาณ 8-15 วินาที แยกมุมมองการเล่าเรื่องกันอย่างชัดเจน เช่น คลิปที่ 1 เน้นปัญหา/Pain Point, คลิปที่ 2 เน้นรีวิวประโยชน์เด่นชัด, คลิปที่ 3 เน้นกระตุ้นการตัดสินใจ/CTA เร่งด่วน)

เงื่อนไขการตอบ:
- ตอบกลับมาเป็น "JSON array เท่านั้น" ห้ามมีข้อความอื่นนอกเหนือจาก JSON
- แต่ละรายการใน Array ต้องมีฟิลด์ดังนี้:
  1. "title": ชื่อหัวข้อคลิปสั้นๆ เข้าใจง่าย
  2. "hook": ประโยคเปิดคลิป 3 วินาทีแรกที่ดึงดูดสายตาคนดูสูงสุด
  3. "voiceover": บทพูดพากย์เสียงภาษาไทยที่กระชับ ชวนติดตาม และปิดท้ายด้วย Call to Action (CTA)
  4. "visual_prompt": คำสั่งภาษาอังกฤษสำหรับสร้างวิดีโอด้วย Veo บรรยายฉาก มุมกล้องแบบ Cinematic แสงสีสวยงาม และการเคลื่อนไหวของสินค้าอย่างละเอียด
  5. "text_on_screen": ข้อความตัวหนังสือสั้นๆ ที่ควรแปะไว้บนหน้าจอเพื่อเน้นย้ำจุดขาย
- ห้ามกล่าวอ้างสรรพคุณเกินจริงหรือเกินข้อมูลสินค้าที่กำหนด`;

      const r = await ai.models.generateContent({model:"gemini-2.5-flash", contents:prompt, config:{responseMimeType:"application/json"}});
      const plans = JSON.parse(r.text); 
      const project_id = crypto.randomUUID();
      const jobs = [];
      
      for (const p of plans.slice(0, count)) {
        const job_id = crypto.randomUUID();
        const jobData = {
          job_id,
          title: p.title,
          hook: p.hook,
          voiceover: p.voiceover,
          visual_prompt: p.visual_prompt,
          text_on_screen: p.text_on_screen || "",
          status: "queued",
          progress: 0,
          message: "รอสร้างวิดีโอ",
          references: d.references || []
        };
        jobs.push(jobData);
        await saveJSON(`job/${job_id}`, jobData);
      }
      
      await saveJSON(`project/${project_id}`, {
        project_id, 
        product: d.product, 
        link: d.link, 
        references: d.references || [], 
        jobs: jobs.map(x => x.job_id), 
        created_at: Date.now()
      });
      
      const base = url.origin;
      for (const j of jobs) {
        fetch(base + "/api/start-video", {
          method: "POST", 
          headers: {"content-type": "application/json"}, 
          body: JSON.stringify({job_id: j.job_id})
        }).catch(()=>{});
      }
      
      return Response.json({project_id, jobs});
    }

    // 4. /api/start-video
    if (path.endsWith("/api/start-video")) {
      const {job_id} = await req.json(); 
      const job = await loadJSON(`job/${job_id}`);
      if (!job) return Response.json({error:"ไม่พบงาน"},{status:404});
      
      job.status = "generating"; 
      job.progress = 10; 
      job.message = "กำลังสร้างด้วย Veo"; 
      await saveJSON(`job/${job_id}`, job);
      
      const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
      const op = await ai.models.generateVideos({
        model: process.env.VEO_MODEL || "veo-3.1-generate-preview",
        prompt: job.visual_prompt,
        config: {aspectRatio: "9:16", resolution: "720p", numberOfVideos: 1}
      });
      
      job.operation = op.name;
      job.progress = 20;
      await saveJSON(`job/${job_id}`, job);
      return Response.json({ok: true});
    }

    // 5. /api/job
    if (path.endsWith("/api/job")) {
      const id = url.searchParams.get("id");
      let job = await loadJSON(`job/${id}`);
      if (!job) return Response.json({error:"ไม่พบ Job"},{status:404});
      
      if (job.status !== "done" && job.operation) {
        const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
        const op = await ai.operations.get({name: job.operation});
        
        if (op.done) {
          if (op.error) {
            job.status = "error";
            job.message = JSON.stringify(op.error);
          } else {
            const v = op.response?.generatedVideos?.[0]?.video;
            if (v) {
              const buf = await v.videoBytes;
              if (buf) {
                const key = `videos/${id}.mp4`;
                await store().set(key, buf, {metadata:{contentType:"video/mp4"}});
                job.video_key = key;
                job.status = "done";
                job.progress = 100;
                job.message = "สร้างวิดีโอเสร็จแล้ว";
                job.video_url = `/.netlify/functions/download?id=${encodeURIComponent(id)}`;
              } else {
                job.status = "done";
                job.progress = 100;
                job.message = "สร้างเสร็จแล้ว (เชื่อมโยงผ่าน URI)";
              }
            }
          }
          await saveJSON(`job/${id}`, job);
        } else {
          job.progress = Math.min(95, (job.progress || 20) + 5);
          job.message = "Veo กำลังเรนเดอร์วิดีโอ...";
          await saveJSON(`job/${id}`, job);
        }
      }
      return Response.json(job);
    }

    // 6. /api/download
    if (path.endsWith("/api/download")) {
      const id = url.searchParams.get("id");
      const j = await loadJSON(`job/${id}`);
      if (!j?.video_key) return new Response("Not found",{status:404});
      const b = await store().get(j.video_key, {type:"arrayBuffer"});
      if (!b) return new Response("Not found",{status:404});
      return new Response(b, {
        headers: {
          "content-type": "video/mp4",
          "content-disposition": `inline; filename="${id}.mp4"`,
          "cache-control": "private, max-age=3600"
        }
      });
    }

    return Response.json({error: "Not found"}, {status: 404});
  } catch (e) {
    return Response.json({error: e.message}, {status: 500});
  }
};

export const config = { path: "/api/*" };
