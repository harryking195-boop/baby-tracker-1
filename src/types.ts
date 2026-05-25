export type EntryType = 'feed' | 'nappy' | 'med'

export type BabyEntry = {
  id: string
  baby_id?: string
  type: EntryType
  happened_at: string
  amount_ml: number | null
  feed_type: string | null
  nappy_type: string | null
  medication_name: string | null
  medication_dose: string | null
  notes: string | null
}

export type BabyProfile = {
  id?: string
  name: string
  birthDate: string
  birthTime: string
  birthWeightKg: number
  birthType: string
  complications: string
  photoUrl?: string | null
  inviteCode?: string | null
}
