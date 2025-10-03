import multer from "multer";
import { NextRequest } from "next/server";

// Configure multer for memory storage (no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow PDF and email files
    const allowedMimes = ["application/pdf", "message/rfc822", "text/plain"];

    const allowedExts = [".pdf", ".eml"];

    const hasValidMime = allowedMimes.includes(file.mimetype);
    const hasValidExt = allowedExts.some((ext) =>
      file.originalname.toLowerCase().endsWith(ext)
    );

    if (hasValidMime || hasValidExt) {
      cb(null, true);
    } else {
      cb(
        new Error("Unsupported file type. Only PDF and EML files are allowed.")
      );
    }
  },
});

// Parse multipart form data using multer
export async function parseMultipartFormData(request: NextRequest): Promise<{
  fields: { [key: string]: any };
  files: { file: Express.Multer.File[] };
}> {
  const formData = await request.formData();
  const file = formData.get("file") as File;

  if (!file) {
    throw new Error("No file provided");
  }

  // Convert File to Multer-compatible format
  const buffer = Buffer.from(await file.arrayBuffer());
  const multerFile: Express.Multer.File = {
    fieldname: "file",
    originalname: file.name,
    encoding: "7bit",
    mimetype: file.type,
    buffer: buffer,
    size: buffer.length,
    stream: null as any,
    destination: "",
    filename: "",
    path: "",
  };

  return {
    fields: {
      filename: file.name,
      fileType: file.type,
    },
    files: {
      file: [multerFile],
    },
  };
}

export { upload };
