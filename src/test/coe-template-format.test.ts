import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { compensationAmountToWords, coeRequestsCompensation } from "@/lib/hrdo";
import {
  formatCoeEmploymentDate,
  isCoeEmploymentEndDateOnOrAfterHireDate,
  validateCoeDocumentUpload,
  widenCoeTemplateTextArea,
} from "@/server/hrdo/coe";

describe("COE document upload validation", () => {
  it("accepts valid PDF and Word DOCX uploads", async () => {
    const pdf = Buffer.from("%PDF-1.7\nsigned", "utf8");
    const pdfResult = await validateCoeDocumentUpload(
      "signed-coe.pdf",
      `data:application/pdf;base64,${pdf.toString("base64")}`,
    );
    expect(pdfResult.mime).toBe("application/pdf");
    expect(pdfResult.bytes).toEqual(pdf);

    const archive = new JSZip();
    archive.file(
      "[Content_Types].xml",
      '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    archive.file("word/document.xml", "<document>Signed COE</document>");
    const docx = await archive.generateAsync({ type: "nodebuffer" });
    const docxResult = await validateCoeDocumentUpload(
      "signed-coe.docx",
      `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${docx.toString("base64")}`,
    );
    expect(docxResult.mime).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(docxResult.bytes).toEqual(docx);
  });

  it("rejects unsupported extensions and invalid Word archives", async () => {
    await expect(
      validateCoeDocumentUpload("signed-coe.doc", "data:application/msword;base64,AAAA"),
    ).rejects.toThrow("PDF or Word (.docx)");
    await expect(
      validateCoeDocumentUpload(
        "signed-coe.docx",
        "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,AAAA",
      ),
    ).rejects.toThrow("valid Word document");
  });
});

describe("COE template text area", () => {
  it("widens the page while keeping paragraphs justified", () => {
    const xml =
      '<w:document><w:pPr><w:jc w:val="both"/></w:pPr><w:sectPr><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:document>';

    const result = widenCoeTemplateTextArea(xml);

    expect(result).toContain('<w:jc w:val="both"/>');
    expect(result).toContain(
      '<w:pgMar w:top="1440" w:right="1080" w:bottom="1440" w:left="1080"/>',
    );
  });

  describe("COE compensation amount in words", () => {
    it("converts pesos, comma-formatted values, and centavos", () => {
      expect(compensationAmountToWords("1")).toBe("One Peso Only");
      expect(compensationAmountToWords("1,234")).toBe(
        "One Thousand Two Hundred Thirty Four Pesos Only",
      );
      expect(compensationAmountToWords("₱25,000.50")).toBe(
        "Twenty Five Thousand Pesos and 50/100 Only",
      );
      expect(compensationAmountToWords("0")).toBe("Zero Pesos Only");
    });

    it("does not produce words for empty, malformed, or unsupported values", () => {
      expect(compensationAmountToWords("")).toBe("");
      expect(compensationAmountToWords("12,34")).toBe("");
      expect(compensationAmountToWords("-100")).toBe("");
      expect(compensationAmountToWords("1,000.999")).toBe("");
      expect(compensationAmountToWords("1,000,000,000,000")).toBe("");
    });
  });

  it("reports templates without page margins", () => {
    expect(() => widenCoeTemplateTextArea("<w:document/>")).toThrow(
      "The COE template page margins are missing.",
    );
  });

  it("formats date-only employment dates for the certificate", () => {
    expect(formatCoeEmploymentDate("2026-06-01")).toBe("June 1, 2026");
    expect(formatCoeEmploymentDate("")).toBe("");
  });

  it("compares hiring and employment end dates chronologically", () => {
    expect(isCoeEmploymentEndDateOnOrAfterHireDate("2024-01-01", "2024-01-01")).toBe(true);
    expect(isCoeEmploymentEndDateOnOrAfterHireDate("2024-01-01", "2024-06-01")).toBe(true);
    expect(isCoeEmploymentEndDateOnOrAfterHireDate("2024-06-01", "2024-01-01")).toBe(false);
    expect(isCoeEmploymentEndDateOnOrAfterHireDate("", "2024-01-01")).toBe(true);
  });

  it("includes compensation when explicitly selected in the request description", () => {
    expect(
      coeRequestsCompensation(
        "Requestor type: Internal Employee | Description: Certificate of Employment",
      ),
    ).toBe(false);
    expect(
      coeRequestsCompensation(
        "Requestor type: Internal Employee | Description: Certificate of Employment, With compensation review",
      ),
    ).toBe(true);
    expect(
      coeRequestsCompensation(
        "Requestor type: Third-Party Verifier | Description: With compensation review",
      ),
    ).toBe(true);
  });

  it("does not enable compensation because the free-text note mentions it", () => {
    expect(
      coeRequestsCompensation(
        "Please include compensation information. | Requestor type: Internal Employee | Description: Certificate of Employment",
      ),
    ).toBe(false);
  });
});
