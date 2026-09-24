import jsPDF from 'jspdf'

import type { AiAnalysis, IntakeDocumentFinding } from '../api/documents'
import { AI_VERDICT_LABELS, SUFFICIENCY_LABELS, TRS_DOMAIN_LABELS } from '../api/documents'

const PAGE_WIDTH = 210
const MARGIN = 15
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const LINE_HEIGHT = 6
const SMALL_LINE = 5

function addWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const lines = doc.splitTextToSize(text, maxWidth) as string[]
  doc.text(lines, x, y)
  return y + lines.length * lineHeight
}

export function generateReportPdf(
  fileName: string,
  analysis: AiAnalysis,
  findings: IntakeDocumentFinding[],
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const publishedFindings = findings.filter((f) => f.publishedAt !== null)

  let y = MARGIN

  // Header
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  y = addWrappedText(doc, 'AI Analysis Report', MARGIN, y, CONTENT_WIDTH, LINE_HEIGHT)
  y += 3

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  y = addWrappedText(doc, `Document: ${fileName}`, MARGIN, y, CONTENT_WIDTH, SMALL_LINE)
  y = addWrappedText(
    doc,
    `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    MARGIN,
    y,
    CONTENT_WIDTH,
    SMALL_LINE,
  )
  doc.setTextColor(0)
  y += 6

  // Divider
  doc.setDrawColor(200)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y += 6

  // AI Verdict
  if (analysis.aiVerdict) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Verdict', MARGIN, y)
    y += LINE_HEIGHT

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(AI_VERDICT_LABELS[analysis.aiVerdict] ?? analysis.aiVerdict, MARGIN, y)
    y += LINE_HEIGHT + 3
  }

  // Executive Summary
  if (analysis.rawOutput.executiveSummary) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Executive Summary', MARGIN, y)
    y += LINE_HEIGHT

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    y = addWrappedText(
      doc,
      analysis.rawOutput.executiveSummary,
      MARGIN,
      y,
      CONTENT_WIDTH,
      SMALL_LINE,
    )
    y += 4
  }

  // Human Validation Questions
  const questions = analysis.rawOutput.humanValidationQuestions ?? []
  if (questions.length > 0) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Questions to Consider', MARGIN, y)
    y += LINE_HEIGHT

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    questions.forEach((q, i) => {
      const line = `${String(i + 1)}. ${q}`
      y = addWrappedText(doc, line, MARGIN, y, CONTENT_WIDTH, SMALL_LINE)
      y += 2
    })
    y += 2
  }

  // Findings
  if (publishedFindings.length > 0) {
    doc.setDrawColor(200)
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
    y += 6

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Findings', MARGIN, y)
    y += LINE_HEIGHT + 2

    publishedFindings.forEach((finding, i) => {
      // Page break check — leave 30mm buffer
      if (y > 267) {
        doc.addPage()
        y = MARGIN
      }

      if (i > 0) {
        doc.setDrawColor(220)
        doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
        y += 5
      }

      // Finding title
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      y = addWrappedText(doc, finding.title, MARGIN, y, CONTENT_WIDTH, LINE_HEIGHT)

      // Domain / category / sufficiency
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100)
      const meta = [
        TRS_DOMAIN_LABELS[finding.trsDomain] ?? finding.trsDomain,
        finding.evidenceCategory,
        finding.sufficiencyRating
          ? (SUFFICIENCY_LABELS[finding.sufficiencyRating] ?? finding.sufficiencyRating)
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
      y = addWrappedText(doc, meta, MARGIN, y, CONTENT_WIDTH, SMALL_LINE)
      doc.setTextColor(0)
      y += 2

      // Finding body
      doc.setFontSize(10)
      y = addWrappedText(doc, finding.body, MARGIN, y, CONTENT_WIDTH, SMALL_LINE)
      y += 5
    })
  }

  const slug = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '-')
  doc.save(`report-${slug}.pdf`)
}
