import { Router, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { query } from "../db";

const UPLOAD_DIR =
  process.env.UPLOADS_DIR ?? process.env.UPLOAD_DIR ?? "/var/app/uploads";

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const MAX_MB = parseInt(process.env.MAX_UPLOAD_MB ?? "20", 10);

const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".docx", ".doc", ".txt"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Tipo de archivo no permitido. Solo PDF, DOCX, DOC, TXT."));
  },
});

const router = Router();
router.use(requireAuth);

// POST /api/upload/parse-document
router.post(
  "/parse-document",
  upload.single("file"),
  async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ message: "No se recibió ningún archivo" });
    }
    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let extractedText = "";

    try {
      if (ext === ".pdf") {
        const pdfParse = (await import("pdf-parse")).default;
        const buffer = fs.readFileSync(filePath);
        const parsed = await pdfParse(buffer);
        extractedText = parsed.text;
      } else if (ext === ".docx" || ext === ".doc") {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ path: filePath });
        extractedText = result.value;
      } else if (ext === ".txt") {
        extractedText = fs.readFileSync(filePath, "utf-8");
      }

      const userCc = req.user!.cc;
      await query(
        `INSERT INTO public.uploaded_documents
           (user_cc, file_name, file_path, mime_type, size_bytes, extracted_text)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          userCc,
          req.file.originalname,
          filePath,
          req.file.mimetype,
          req.file.size,
          extractedText,
        ]
      );

      return res.json({
        fileName: req.file.originalname,
        extractedText: extractedText.trim(),
        sizeBytes: req.file.size,
        message: "Archivo procesado correctamente",
      });
    } catch (err: any) {
      console.error("Error procesando archivo:", err);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          /* ignore */
        }
      }
      return res
        .status(500)
        .json({ message: err?.message ?? "Error procesando el archivo" });
    }
  }
);

export default router;
