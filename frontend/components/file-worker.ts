import * as exifr from "exifr";
import { PDFDocument } from "pdf-lib";
import { documentMetadata } from "./document-metadata";
self.onmessage = async (
  event: MessageEvent<{ buffer: ArrayBuffer; name: string; type: string }>,
) => {
  try {
    const { buffer, name, type } = event.data;
    const bytes = new Uint8Array(buffer);
    if (bytes.length > 10 * 1024 * 1024)
      throw new Error("Maximum file size is 10 MB.");
    const value: Record<string, unknown> = {
      filename: name,
      size_bytes: bytes.length,
      declared_type: type || "Unknown",
      sha256: Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join(""),
    };
    let source = "Browser",
      title = "File properties";
    if (new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") {
      const pdf = await PDFDocument.load(bytes, {
        ignoreEncryption: false,
        updateMetadata: false,
      });
      Object.assign(value, {
        pages: pdf.getPageCount(),
        title: pdf.getTitle(),
        author: pdf.getAuthor(),
        creator: pdf.getCreator(),
        producer: pdf.getProducer(),
        creation_date: pdf.getCreationDate()?.toISOString(),
        modification_date:pdf.getModificationDate()?.toISOString(),
        subject:pdf.getSubject(),
        keywords:pdf.getKeywords(),
        page_dimensions:pdf.getPages().slice(0,100).map((p,i)=>({page:i+1,width_points:p.getWidth(),height_points:p.getHeight(),rotation:p.getRotation().angle})),
      });
      source = "pdf-lib";
      title = "PDF properties";
    } else if (type.startsWith("image/")) {
      const metadata = await exifr
        .parse(buffer, {
          gps: true,
          tiff: true,
          exif: true,
          iptc: true,
          xmp: false,
        })
        .catch(() => null);
      value.metadata = metadata || "No supported metadata found";
      const bitmap = await createImageBitmap(new Blob([buffer]));
      Object.assign(value, { width: bitmap.width, height: bitmap.height,megapixels:Number((bitmap.width*bitmap.height/1000000).toFixed(2)),aspect_ratio:Number((bitmap.width/bitmap.height).toFixed(3)) });
      bitmap.close();
      source = "exifr / browser";
      title = "Image properties";
    } else if(bytes[0]===0x50&&bytes[1]===0x4b&&bytes[2]===3&&bytes[3]===4) {
      const metadata=documentMetadata(bytes);
      value.document_metadata=Object.keys(metadata).length?metadata:"No supported document metadata found";
      source="Document package";title="Document properties";
    } else {
      value.note =
        "Only file size and SHA-256 are supported for this format. No document contents or video metadata are inferred.";
    }
    self.postMessage({
      findings: [
        {
          source,
          title,
          value,
          confidence: "high",
          observed_at: new Date().toISOString(),
        },
      ],
    });
  } catch {
    self.postMessage({
      error: "Unsupported, encrypted, oversized, or invalid file.",
    });
  }
};
