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
      mockHtml2Canvas as unknown as typeof import('html2canvas-pro').default,
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
    const button = wrapper.find('button')
    expect(button.exists()).toBe(true)
    expect(button.text()).toBe('Download PDF')
  })

  it('is not disabled by default', () => {
    const wrapper = mountButton()
    const button = wrapper.find('button')
    expect(button.element.hasAttribute('disabled')).toBe(false)
  })

  it('does not show an error by default', () => {
    const wrapper = mountButton()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows loading state when export starts and preview element exists', async () => {
    const preview = document.createElement('div')
    preview.id = 'resume-preview'
    document.body.appendChild(preview)

    // Make the mock never resolve so we can observe the loading state
    mockHtml2Canvas.mockReturnValue(new Promise(() => {}))

    const wrapper = mountButton()
    const button = wrapper.find('button')

    await button.trigger('click')

    expect(button.text()).toBe('Exporting...')
    expect(button.element.hasAttribute('disabled')).toBe(true)
    expect(wrapper.find('.animate-spin').exists()).toBe(true)
  })

  it('triggers html2canvas and jsPDF when clicked', async () => {
    const preview = document.createElement('div')
    preview.id = 'resume-preview'
    document.body.appendChild(preview)

    const canvas = createMockCanvas()
    mockHtml2Canvas.mockResolvedValue(canvas)

    const wrapper = mountButton()
    await wrapper.find('button').trigger('click')

    // Wait for async export to complete
    await vi.waitFor(() => {
      expect(mockHtml2Canvas).toHaveBeenCalledWith(preview, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      })
    })
  })

  it('exports successfully when the preview contains oklch colors (Tailwind v4)', async () => {
    // RES-111: Tailwind v4 emits oklch(...) colors by default. html2canvas
    // 1.x threw "Attempting to parse an unsupported color function
    // \"oklch\"" during capture, breaking PDF export. The composable now
    // uses html2canvas-pro (oklch-aware) — this test pins the acceptance
    // criterion that an oklch-styled preview flows through the export
    // pipeline without error.
    const preview = document.createElement('div')
    preview.id = 'resume-preview'
    document.body.appendChild(preview)

    // Simulate Tailwind v4 palette colors on the preview subtree, e.g.
    // text-gray-600 → oklch(0.708 0 0) and bg-gray-200 → oklch(0.928 ...).
    const colored = document.createElement('span')
    colored.setAttribute(
      'style',
      'color: oklch(0.708 0 0); background-color: oklch(0.928 0.006 264.531)',
    )
    colored.textContent = 'Colored text'
    preview.appendChild(colored)

    const canvas = createMockCanvas()
    mockHtml2Canvas.mockResolvedValue(canvas)

    const wrapper = mountButton()
    await wrapper.find('button').trigger('click')

    // The mock is typed as a no-arg function, so widen its recorded calls
    // to read back the captured element + options.
    const calls = mockHtml2Canvas.mock
      .calls as unknown as [HTMLElement, Record<string, unknown>][]

    await vi.waitFor(() => {
      expect(calls.length).toBeGreaterThan(0)
      // The oklch-styled node must be inside the captured subtree
      const [captured] = calls[0]!
      expect(captured).toBe(preview)
      expect(captured.querySelector('span')).toBe(colored)
    })

    // Export completed without throwing: no error alert, button idle again
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    const button = wrapper.find('button')
    expect(button.text()).toBe('Download PDF')
    expect(button.element.hasAttribute('disabled')).toBe(false)
  })

  it('shows an error when the preview element is missing', async () => {
    const wrapper = mountButton()
    await wrapper.find('button').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })

    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Preview element not found',
    )
    expect(wrapper.find('button').text()).toBe('Download PDF')
  })

  it('shows an error when html2canvas fails', async () => {
    const preview = document.createElement('div')
    preview.id = 'resume-preview'
    document.body.appendChild(preview)

    mockHtml2Canvas.mockRejectedValue(new Error('Canvas error'))

    const wrapper = mountButton()
    await wrapper.find('button').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })

    expect(wrapper.find('[role="alert"]').text()).toBe('Canvas error')
  })

  it('resets loading state after successful export', async () => {
    const preview = document.createElement('div')
    preview.id = 'resume-preview'
    document.body.appendChild(preview)

    const canvas = createMockCanvas()
    mockHtml2Canvas.mockResolvedValue(canvas)

    const wrapper = mountButton()
    await wrapper.find('button').trigger('click')

    await vi.waitFor(() => {
      const button = wrapper.find('button')
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
    await wrapper.find('button').trigger('click')

    await vi.waitFor(() => {
      const button = wrapper.find('button')
      expect(button.text()).toBe('Download PDF')
      expect(button.element.hasAttribute('disabled')).toBe(false)
    })
  })
})
