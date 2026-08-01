import { ref } from 'vue'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

/**
 * Composables that use html2canvas internally must set the html2canvas
 * implementation at import time. For testing, we provide a way to inject
 * a mock.
 */
let _html2canvas: typeof html2canvas = html2canvas

/**
 * Override the html2canvas implementation (for testing).
 * Pass undefined to restore the default.
 * @param impl - The mock implementation or undefined to restore.
 */
export function setHtml2Canvas(impl: typeof html2canvas | undefined): void {
  _html2canvas = impl ?? html2canvas
}

/** A4 width in mm */
const A4_WIDTH_MM = 210
/** A4 height in mm */
const A4_HEIGHT_MM = 297

/**
 * usePdfExport — captures the #resume-preview DOM element via html2canvas
 * and generates a multi-page A4 PDF via jsPDF.
 */
export function usePdfExport() {
  /** Whether an export is currently in progress. */
  const isExporting = ref(false)
  /** Error message from the last failed export, or null. */
  const exportError = ref<string | null>(null)

  /**
   * Capture the preview and trigger a browser download.
   * @param filename - The downloaded file name (defaults to 'resume.pdf').
   */
  async function exportPdf(filename = 'resume.pdf'): Promise<void> {
    isExporting.value = true
    exportError.value = null

    try {
      const element = document.getElementById('resume-preview')
      if (!element) {
        throw new Error('Preview element not found')
      }

      const canvas = await _html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      })

      const imgData = canvas.toDataURL('image/jpeg', 0.95)
      const imgWidth = A4_WIDTH_MM
      const imgHeight = (canvas.height * A4_WIDTH_MM) / canvas.width

       
      const pdf = new jsPDF('p', 'mm', 'a4')
      let heightLeft = imgHeight
      let position = 0

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
      heightLeft -= A4_HEIGHT_MM

      while (heightLeft > 0) {
        position = -(A4_HEIGHT_MM * pdf.getNumberOfPages())
        pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
        heightLeft -= A4_HEIGHT_MM
      }

      pdf.save(filename)
    } catch (err) {
      exportError.value =
        err instanceof Error ? err.message : 'Failed to export PDF'
    } finally {
      isExporting.value = false
    }
  }

  return {
    isExporting,
    exportError,
    exportPdf,
  }
}
