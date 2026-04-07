import type { Shop } from '../../types';

export function mapAdminShopRow(s: Record<string, unknown>): Shop {
  return {
    id: String(s.id),
    ownerId: String(s.owner_id),
    name: String(s.name || ''),
    type: (s.type as Shop['type']) || 'BARBER',
    description: String(s.description || ''),
    address: String(s.address || ''),
    profileImage: String(s.profile_image || ''),
    bannerImage: String(s.banner_image || ''),
    primaryColor: String(s.primary_color || '#1a1a1a'),
    theme: (s.theme as Shop['theme']) || 'MODERN',
    services: [],
    professionals: [],
    products: [],
    subscriptionActive: Boolean(s.subscription_active),
    subscriptionAmount: s.subscription_amount != null ? Number(s.subscription_amount) : 99,
    asaasPlatformSubscriptionId:
      s.asaas_platform_subscription_id != null && String(s.asaas_platform_subscription_id).trim() !== ''
        ? String(s.asaas_platform_subscription_id).trim()
        : null,
    splitPercent: s.split_percent != null ? Number(s.split_percent) : 95,
    passFeesToCustomer: s.pass_fees_to_customer === true,
    rating: s.rating != null ? Number(s.rating) : 5,
    asaasAccountId: s.asaas_account_id != null ? String(s.asaas_account_id) : undefined,
    asaasWalletId: s.asaas_wallet_id != null ? String(s.asaas_wallet_id) : undefined,
    asaasApiKeyConfigured: s.asaas_api_key_configured === true,
    cnpjOrCpf: s.cnpj_cpf != null ? String(s.cnpj_cpf) : undefined,
    email: s.email != null ? String(s.email) : undefined,
    phone: s.phone != null ? String(s.phone) : undefined,
    pixKey: s.pix_key != null ? String(s.pix_key) : undefined,
    workdayStart: s.workday_start != null ? String(s.workday_start).slice(0, 5) : undefined,
    workdayEnd: s.workday_end != null ? String(s.workday_end).slice(0, 5) : undefined,
    lunchStart:
      s.lunch_start != null && String(s.lunch_start).trim() !== ''
        ? String(s.lunch_start).slice(0, 5)
        : undefined,
    lunchEnd:
      s.lunch_end != null && String(s.lunch_end).trim() !== ''
        ? String(s.lunch_end).slice(0, 5)
        : undefined,
    agendaSlotMinutes:
      s.agenda_slot_minutes != null && Number(s.agenda_slot_minutes) > 0
        ? Number(s.agenda_slot_minutes)
        : 30,
    financeProvisionStatus: s.finance_provision_status as Shop['financeProvisionStatus'],
    financeProvisionLastError:
      s.finance_provision_last_error != null ? String(s.finance_provision_last_error) : undefined,
  };
}
