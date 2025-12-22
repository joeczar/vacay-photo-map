/**
 * File validation tests
 */

import { describe, it, expect } from "bun:test";
import {
  validateFileSignature,
  validateImageFile,
  isValidImageType,
  isValidFileSize,
  MAX_FILE_SIZE_MB,
} from "./fileValidation";
import { createJpegFile, createPngFile, createWebpFile } from "../test-helpers";

// =============================================================================
// File Signature Validation Tests
// =============================================================================

describe("validateFileSignature", () => {
  describe("valid files", () => {
    it("should accept valid JPEG file", async () => {
      const file = createJpegFile();
      const result = await validateFileSignature(file);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept valid PNG file", async () => {
      const file = createPngFile();
      const result = await validateFileSignature(file);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept valid WebP file", async () => {
      const file = createWebpFile();
      const result = await validateFileSignature(file);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe("spoofed MIME types", () => {
    it("should reject file with JPEG signature but PNG MIME type", async () => {
      // Create JPEG bytes with wrong MIME type
      const jpegBytes = new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
      ]);
      const file = new File([jpegBytes], "fake.png", { type: "image/png" });

      const result = await validateFileSignature(file);

      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        "File signature does not match declared MIME type",
      );
    });

    it("should reject file with PNG signature but JPEG MIME type", async () => {
      // Create PNG bytes with wrong MIME type
      const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      const file = new File([pngBytes], "fake.jpg", { type: "image/jpeg" });

      const result = await validateFileSignature(file);

      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        "File signature does not match declared MIME type",
      );
    });

    it("should reject file with WebP signature but JPEG MIME type", async () => {
      // Create WebP bytes with wrong MIME type
      const webpBytes = new Uint8Array([
        82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80,
      ]);
      const file = new File([webpBytes], "fake.jpg", { type: "image/jpeg" });

      const result = await validateFileSignature(file);

      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        "File signature does not match declared MIME type",
      );
    });
  });

  describe("invalid signatures", () => {
    it("should reject file with unrecognized signature", async () => {
      // Text file masquerading as image
      const textBytes = new TextEncoder().encode("This is not an image");
      const file = new File([textBytes], "fake.jpg", { type: "image/jpeg" });

      const result = await validateFileSignature(file);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Unrecognized file signature");
    });

    it("should reject empty file", async () => {
      const file = new File([], "empty.jpg", { type: "image/jpeg" });

      const result = await validateFileSignature(file);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Unrecognized file signature");
    });

    it("should reject file with incomplete header", async () => {
      // Only 2 bytes (not enough to match any signature)
      const tinyBytes = new Uint8Array([0xff, 0xd8]);
      const file = new File([tinyBytes], "tiny.jpg", { type: "image/jpeg" });

      const result = await validateFileSignature(file);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Unrecognized file signature");
    });
  });
});

// =============================================================================
// MIME Type Validation Tests
// =============================================================================

describe("isValidImageType", () => {
  it("should accept JPEG", () => {
    const file = createJpegFile();
    expect(isValidImageType(file)).toBe(true);
  });

  it("should accept PNG", () => {
    const file = createPngFile();
    expect(isValidImageType(file)).toBe(true);
  });

  it("should accept WebP", () => {
    const file = createWebpFile();
    expect(isValidImageType(file)).toBe(true);
  });

  it("should reject GIF", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "test.gif", {
      type: "image/gif",
    });
    expect(isValidImageType(file)).toBe(false);
  });

  it("should reject text file", () => {
    const file = new File(["text"], "test.txt", { type: "text/plain" });
    expect(isValidImageType(file)).toBe(false);
  });
});

// =============================================================================
// File Size Validation Tests
// =============================================================================

describe("isValidFileSize", () => {
  it("should accept file within size limit", () => {
    const bytes = new Uint8Array(1024 * 1024); // 1MB
    const file = new File([bytes], "test.jpg", { type: "image/jpeg" });
    expect(isValidFileSize(file)).toBe(true);
  });

  it("should accept file at exact size limit", () => {
    const bytes = new Uint8Array(MAX_FILE_SIZE_MB * 1024 * 1024);
    const file = new File([bytes], "test.jpg", { type: "image/jpeg" });
    expect(isValidFileSize(file)).toBe(true);
  });

  it("should reject file over size limit", () => {
    const bytes = new Uint8Array(MAX_FILE_SIZE_MB * 1024 * 1024 + 1);
    const file = new File([bytes], "test.jpg", { type: "image/jpeg" });
    expect(isValidFileSize(file)).toBe(false);
  });

  it("should accept custom size limit", () => {
    const bytes = new Uint8Array(2 * 1024 * 1024); // 2MB
    const file = new File([bytes], "test.jpg", { type: "image/jpeg" });
    expect(isValidFileSize(file, 5)).toBe(true);
    expect(isValidFileSize(file, 1)).toBe(false);
  });
});

// =============================================================================
// Integrated Validation Tests
// =============================================================================

describe("validateImageFile", () => {
  it("should accept valid JPEG file", async () => {
    const file = createJpegFile();
    const result = await validateImageFile(file);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("should accept valid PNG file", async () => {
    const file = createPngFile();
    const result = await validateImageFile(file);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("should accept valid WebP file", async () => {
    const file = createWebpFile();
    const result = await validateImageFile(file);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("should reject file with invalid MIME type", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "test.gif", {
      type: "image/gif",
    });
    const result = await validateImageFile(file);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("not allowed");
  });

  it("should reject file over size limit", async () => {
    const bytes = new Uint8Array(MAX_FILE_SIZE_MB * 1024 * 1024 + 1);
    const file = new File([bytes], "huge.jpg", { type: "image/jpeg" });
    const result = await validateImageFile(file);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds maximum");
  });

  it("should reject file with spoofed MIME type", async () => {
    // Text file claiming to be JPEG
    const textBytes = new TextEncoder().encode("Not an image");
    const file = new File([textBytes], "fake.jpg", { type: "image/jpeg" });
    const result = await validateImageFile(file);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Unrecognized file signature");
  });

  it("should reject JPEG signature with wrong MIME type", async () => {
    // JPEG bytes with PNG MIME type
    const jpegBytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ]);
    const file = new File([jpegBytes], "spoofed.png", { type: "image/png" });
    const result = await validateImageFile(file);

    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "File signature does not match declared MIME type",
    );
  });
});
