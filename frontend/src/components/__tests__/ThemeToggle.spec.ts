import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { useTheme } from '@/shared/composables/useTheme'

/**
 * Mount ThemeToggle attached to document.body so teleported
 * DropdownMenuContent items are findable via document.querySelector.
 */
function mountToggle() {
  return mount(ThemeToggle, {
    attachTo: document.body,
  })
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    const { setTheme } = useTheme()
    setTheme('system')
  })

  it('renders the toggle button with data-testid', () => {
    const wrapper = mountToggle()
    const button = wrapper.find('[data-testid="theme-toggle"]')
    expect(button.exists()).toBe(true)
  })

  it('has accessible aria-label on the toggle button', () => {
    const wrapper = mountToggle()
    const button = wrapper.find('[data-testid="theme-toggle"]')
    expect(button.attributes('aria-label')).toBe('Toggle theme')
  })

  it('renders DropdownMenuContent with theme options when clicked', async () => {
    const wrapper = mountToggle()

    // Click the trigger to open the dropdown
    const trigger = wrapper.find('[data-testid="theme-toggle"]')
    await trigger.trigger('click')
    await nextTick()

    // Dropdown items are teleported to body, search document
    const lightItem = document.querySelector('[data-testid="theme-light"]')
    const darkItem = document.querySelector('[data-testid="theme-dark"]')
    const systemItem = document.querySelector('[data-testid="theme-system"]')

    expect(lightItem).not.toBeNull()
    expect(darkItem).not.toBeNull()
    expect(systemItem).not.toBeNull()
  })

  it('highlights the current theme in the dropdown', async () => {
    const { setTheme } = useTheme()
    setTheme('dark')

    const wrapper = mountToggle()
    const trigger = wrapper.find('[data-testid="theme-toggle"]')
    await trigger.trigger('click')
    await nextTick()

    const darkItem = document.querySelector('[data-testid="theme-dark"]')
    expect(darkItem).not.toBeNull()
    expect(darkItem!.classList.contains('font-semibold')).toBe(true)
  })

  it('changes theme to light when Light option is clicked', async () => {
    const { theme } = useTheme()
    // Start from dark to confirm the change
    theme.value = 'dark'

    const wrapper = mountToggle()
    const trigger = wrapper.find('[data-testid="theme-toggle"]')
    await trigger.trigger('click')
    await nextTick()

    const lightItem = document.querySelector('[data-testid="theme-light"]') as HTMLElement
    expect(lightItem).not.toBeNull()
    lightItem!.click()
    await nextTick()

    expect(theme.value).toBe('light')
  })

  it('changes theme to dark when Dark option is clicked', async () => {
    const { theme } = useTheme()
    theme.value = 'light'

    const wrapper = mountToggle()
    const trigger = wrapper.find('[data-testid="theme-toggle"]')
    await trigger.trigger('click')
    await nextTick()

    const darkItem = document.querySelector('[data-testid="theme-dark"]') as HTMLElement
    expect(darkItem).not.toBeNull()
    darkItem!.click()
    await nextTick()

    expect(theme.value).toBe('dark')
  })

  it('changes theme to system when System option is clicked', async () => {
    const { theme } = useTheme()
    theme.value = 'dark'

    const wrapper = mountToggle()
    const trigger = wrapper.find('[data-testid="theme-toggle"]')
    await trigger.trigger('click')
    await nextTick()

    const systemItem = document.querySelector('[data-testid="theme-system"]') as HTMLElement
    expect(systemItem).not.toBeNull()
    systemItem!.click()
    await nextTick()

    expect(theme.value).toBe('system')
  })
})
