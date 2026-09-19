// Every manager-editable setting, with its bounds. The keys mirror the `settings` table.
export const SETTING_SPECS = {
  sla_routine_hours: { label: "SLA — oddiy (soat)", hint: "Oddiy vazifa uchun muddat", min: 1, max: 720, integer: false, fallback: "24" },
  sla_urgent_hours: { label: "SLA — shoshilinch (soat)", hint: "Shoshilinch vazifa uchun muddat", min: 1, max: 720, integer: false, fallback: "8" },
  sla_critical_hours: { label: "SLA — kritik (soat)", hint: "Kritik vazifa uchun muddat", min: 1, max: 720, integer: false, fallback: "4" },
  sla_time_scale: { label: "Vaqt tezlashtirish (demo)", hint: "1 = real vaqt, 60 = demo rejimi", min: 1, max: 1440, integer: false, fallback: "1" },
  otp_expiry_minutes: { label: "OTP amal qilish muddati (daqiqa)", hint: "Tasdiqlash kodi necha daqiqa amal qiladi", min: 1, max: 1440, integer: true, fallback: "30" },
  random_verify_percent: { label: "Tasodifiy tekshiruv (%)", hint: "Tasdiqlangan tashriflarning qancha foizi qayta tekshiriladi", min: 0, max: 100, integer: true, fallback: "10" },
} as const;

export type SettingKey = keyof typeof SETTING_SPECS;
export const SETTING_KEYS = Object.keys(SETTING_SPECS) as SettingKey[];
