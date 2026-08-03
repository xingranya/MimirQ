/**
 * 全局界面层级契约。业务组件不得自行使用超出此表的任意 z-index。
 */
export const UI_LAYER_CLASS = {
  documentPanel: 'z-30',
  navigationOverlay: 'z-40',
  navigation: 'z-50',
  modalOverlay: 'z-60',
  modal: 'z-70',
  contextual: 'z-80',
  toast: 'z-90',
  immersive: 'z-100',
} as const

export type UiLayer = keyof typeof UI_LAYER_CLASS
