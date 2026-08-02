import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setHtml2Canvas } from '@/features/builder/composables/usePdfExport'
import PdfExportButton from '@/features/builder/components/PdfExportButton.vue'

/**
 * Creates a fake canvas with predictable dimensions.
 */
function createMockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 1632
  canvas.height = 2112
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/jpeg;base64,mock')
  return canvas
}

describe('PdfExportButton', () => {
  let mockHtml2Canvas: ReturnType<typeof vi.fn<() => Promise<HTMLCanvasElement>>>

  beforeEach(() => {
    vi.clearAllMocks()
    // Remove any #resume-preview from previous tests
    document.body.innerHTML = ''
    mockHtml2Canvas = vi.fn<() => Promise<HTMLCanvasElement>>()
    setHtml2Canvas(
      mockHtml2Canvas as unknown as typeof import('html2canvas').default,
    )
  })

  /**
   *
   */
  function mountButton() {
    return mount(PdfExportButton)
  }

  it('renders the download button', () => {
    const wrapper = mountButton()
    const button = wrapper.find('.pdf-export__button')
    expect(button.exists()).toBe(true)
    expect(button.text()).toBe('Download PDF')
  })

  it('is not disabled by default', () => {
    const wrapper = mountButton()
    const button = wrapper.find('.pdf-export__button')
    expect(button.element.hasAttribute('disabled')).toBe(false)
  })

  it('does not show an error by default', () => {
    const wrapper = mountButton()
    expect(wrapper.find('.pdf-export__error').exists()).toBe(false)
  })

  it('shows loading state when export starts and preview element exists', async () => {
    const preview = document.createElement('div')
    preview.id = 'resume-preview'
    document.body.appendChild(preview)

    // Make the mock never resolve so we can observe the loading state
    mockHtml2Canvas.mockReturnValue(new Promise(() => {}))

    const wrapper = mountButton()
    const button = wrapper.find('.pdf-export__button')

    await button.trigger('click')

    expect(button.text()).toBe('Exporting...')
    expect(button.element.hasAttribute('disabled')).toBe(true)
    expect(wrapper.find('.pdf-export__spinner').exists()).toBe(true)
  })

  it('triggers html2canvas and jsPDF when clicked', async () => {
    const preview = document.createElement('div')
    preview.id = 'resume-preview'
    document.body.appendChild(preview)

    const canvas = createMockCanvas()
    mockHtml2Canvas.mockResolvedValue(canvas)

    const wrapper = mountButton()
    await wrapper.find('.pdf-export__button').trigger('click')

    // Wait for async export to complete
    await vi.waitFor(() => {
      expect(mockHtml2Canvas).toHaveBeenCalledWith(preview, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      })
    })
  })

  it('shows an error when the preview element is missing', async () => {
    const wrapper = mountButton()
    await wrapper.find('.pdf-export__button').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.find('.pdf-export__error').exists()).toBe(true)
    })

    expect(wrapper.find('.pdf-export__error').text()).toBe(
      'Preview element not found',
    )
    expect(wrapper.find('.pdf-export__button').text()).toBe('Download PDF')
  })

  it('shows an error when html2canvas fails', async () => {
    const preview = document.createElement('div')
    preview.id = 'resume-preview'
    document.body.appendChild(preview)

    mockHtml2Canvas.mockRejectedValue(new Error('Canvas error'))

    const wrapper = mountButton()
    await wrapper.find('.pdf-export__button').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.find('.pdf-export__error').exists()).toBe(true)
    })

    expect(wrapper.find('.pdf-export__error').text()).toBe('Canvas error')
  })

  it('resets loading state after successful export', async () => {
    const preview = document.createElement('div')
    preview.id = 'resume-preview'
    document.body.appendChild(preview)

    const canvas = createMockCanvas()
    mockHtml2Canvas.mockResolvedValue(canvas)

    const wrapper = mountButton()
    await wrapper.find('.pdf-export__button').trigger('click')

    await vi.waitFor(() => {
      const button = wrapper.find('.pdf-export__button')
      expect(button.text()).toBe('Download PDF')
      expect(button.element.hasAttribute('disabled')).toBe(false)
    })
  })

  it('resets loading state after failed export', async () => {
    const preview = document.createElement('div')
    preview.id = 'resume-preview'
    document.body.appendChild(preview)

    mockHtml2Canvas.mockRejectedValue(new Error('fail'))

    const wrapper = mountButton()
    await wrapper.find('.pdf-export__button').trigger('click')

    await vi.waitFor(() => {
      const button = wrapper.find('.pdf-export__button')
      expect(button.text()).toBe('Download PDF')
      expect(button.element.hasAttribute('disabled')).toBe(false)
    })
  })
})
