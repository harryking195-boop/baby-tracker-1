import { useEffect, useMemo, useState } from 'react'
import { createClient, type Session } from '@supabase/supabase-js'
import {
  ArrowLeft,
  Baby,
  CalendarDays,
  ChevronDown,
  Copy,
  Droplets,
  LogOut,
  Milk,
  Pill,
  Plus,
  QrCode,
  Save,
  Share2,
  Trash2,
  User,
  UserCircle,
} from 'lucide-react'
import QRCode from 'qrcode'
import { babyProfile, importedEntries } from './seedData'
import type { BabyEntry, BabyProfile, EntryType } from './types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)
const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseAnonKey) : null

const entryTypes = {
  feed: { label: 'Feed', icon: Milk },
  nappy: { label: 'Nappy', icon: Droplets },
  med: { label: 'Meds', icon: Pill },
} as const

type EntryForm = {
  happened_at: string
  amount_ml: string
  duration_mins: string
  feed_type: string
  nappy_type: string
  medication_name: string
  medication_dose: string
  notes: string
}

const initialForm = (): EntryForm => ({
  happened_at: new Date().toISOString().slice(0, 16),
  amount_ml: '',
  duration_mins: '',
  feed_type: 'Bottle',
  nappy_type: 'Wet',
  medication_name: '',
  medication_dose: '',
  notes: '',
})

function formatTime(value: string) {
  return new Date(value).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getEstimatedMilkMl(entry: BabyEntry) {
  if (entry.type !== 'feed') return 0

  const bottleAmount = entry.amount_ml || 0
  const breastEstimate =
    entry.feed_type?.toLowerCase().includes('breast') && entry.duration_mins
      ? entry.duration_mins * 7
      : 0

  return bottleAmount + breastEstimate
}

function isBreastFeed(feedType: string | null) {
  return Boolean(feedType?.toLowerCase().includes('breast'))
}

function fromBabyRow(row: Record<string, unknown>): BabyProfile {
  return {
    id: row.id as string,
    name: row.name as string,
    birthDate: (row.birth_date as string) || '',
    birthTime: (row.birth_time as string) || '',
    birthWeightKg: Number(row.birth_weight_kg || 0),
    birthType: (row.birth_type as string) || '',
    complications: (row.complications as string) || '',
    photoUrl: (row.photo_url as string | null) || null,
    inviteCode: (row.invite_code as string | null) || null,
  }
}

function toBabyRow(profile: BabyProfile) {
  return {
    name: profile.name,
    birth_date: profile.birthDate,
    birth_time: profile.birthTime,
    birth_weight_kg: profile.birthWeightKg,
    birth_type: profile.birthType,
    complications: profile.complications,
    photo_url: profile.photoUrl || null,
  }
}

export default function BabyTrackerApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(hasSupabaseConfig)
  const [entries, setEntries] = useState<BabyEntry[]>(importedEntries)
  const [usingImportedData, setUsingImportedData] = useState(true)
  const [babyId, setBabyId] = useState('')
  const [activeType, setActiveType] = useState<EntryType>('feed')
  const [currentPage, setCurrentPage] = useState<'tracker' | 'profile'>('tracker')
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [profile, setProfile] = useState<BabyProfile>(babyProfile)
  const [profileForm, setProfileForm] = useState<BabyProfile>(babyProfile)
  const [babyPhoto, setBabyPhoto] = useState('')
  const [photoDraft, setPhotoDraft] = useState('')
  const [partnerEmail, setPartnerEmail] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState<EntryForm>(initialForm)

  useEffect(() => {
    if (!supabase) {
      setMessage('Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env to enable login.')
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) {
      void loadCloudAccount()
    }
  }, [session])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (profile.inviteCode) url.searchParams.set('invite', profile.inviteCode)
    setShareLink(url.toString())
  }, [profile.inviteCode])

  useEffect(() => {
    const inviteCode = new URLSearchParams(window.location.search).get('invite')
    if (session && inviteCode) {
      void joinByInvite(inviteCode)
    }
  }, [session])

  useEffect(() => {
    if (!shareLink) return

    QRCode.toDataURL(shareLink, {
      margin: 2,
      width: 220,
      color: {
        dark: '#16202a',
        light: '#ffffff',
      },
    }).then(setQrCodeUrl)
  }, [shareLink])

  async function signOut() {
    if (!supabase) return

    await supabase.auth.signOut()
    setEntries([])
    setAccountMenuOpen(false)
  }

  async function signIn() {
    if (!supabase) return

    setMessage('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href },
    })
    setMessage(error ? error.message : 'Check your email for a magic login link.')
  }

  async function loadCloudAccount() {
    if (!supabase) return

    const inviteCode = new URLSearchParams(window.location.search).get('invite')
    if (inviteCode) {
      await joinByInvite(inviteCode)
      return
    }

    const { data: memberships, error: membershipError } = await supabase
      .from('baby_members')
      .select('baby_id')
      .limit(1)

    if (membershipError) {
      setUsingImportedData(true)
      setMessage(`${membershipError.message}. New entries will save locally for now.`)
      return
    }

    const existingBabyId = memberships?.[0]?.baby_id as string | undefined
    if (existingBabyId) {
      await loadBaby(existingBabyId)
      return
    }

    await createCloudBaby()
  }

  async function createCloudBaby() {
    if (!supabase || !session) return

    const { data: baby, error: babyError } = await supabase
      .from('babies')
      .insert({ ...toBabyRow(profile), created_by: session.user.id })
      .select('*')
      .single()

    if (babyError) {
      setUsingImportedData(true)
      setMessage(`${babyError.message}. New entries will save locally for now.`)
      return
    }

    const cloudProfile = fromBabyRow(baby)
    await supabase.from('baby_members').insert({
      baby_id: cloudProfile.id,
      user_id: session.user.id,
      role: 'owner',
    })
    setProfile(cloudProfile)
    setProfileForm(cloudProfile)
    setBabyPhoto(cloudProfile.photoUrl || '')
    setBabyId(cloudProfile.id || '')
    setUsingImportedData(false)
    await loadEntries(cloudProfile.id || '')
  }

  async function joinByInvite(inviteCode: string) {
    if (!supabase || !session) return

    const { data: baby, error } = await supabase.rpc('join_baby_by_invite', {
      code: inviteCode,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    const cloudProfile = fromBabyRow(baby)
    setProfile(cloudProfile)
    setProfileForm(cloudProfile)
    setBabyPhoto(cloudProfile.photoUrl || '')
    setBabyId(cloudProfile.id || '')
    setUsingImportedData(false)
    await loadEntries(cloudProfile.id || '')
    setMessage(`Joined ${cloudProfile.name}'s tracker.`)
  }

  async function loadBaby(id: string) {
    if (!supabase) return

    const { data: baby, error } = await supabase.from('babies').select('*').eq('id', id).single()
    if (error) {
      setMessage(error.message)
      return
    }

    const cloudProfile = fromBabyRow(baby)
    setProfile(cloudProfile)
    setProfileForm(cloudProfile)
    setBabyPhoto(cloudProfile.photoUrl || '')
    setBabyId(id)
    setUsingImportedData(false)
    await loadEntries(id)
  }

  async function loadEntries(id = babyId) {
    if (!supabase || !id) return

    const { data, error } = await supabase
      .from('baby_entries')
      .select('*')
      .eq('baby_id', id)
      .order('happened_at', { ascending: false })
      .limit(100)

    if (error) {
      setUsingImportedData(true)
      setEntries(importedEntries)
      setMessage(`${error.message}. New entries will save locally in this browser session for now.`)
      return
    }

    const remoteEntries = (data || []) as BabyEntry[]
    setEntries(remoteEntries)
    setUsingImportedData(false)
  }

  async function addEntry() {
    setSaving(true)
    setMessage('')

    const payload: BabyEntry = {
      id: crypto.randomUUID(),
      baby_id: babyId || undefined,
      type: activeType,
      happened_at: new Date(form.happened_at).toISOString(),
      amount_ml:
        activeType === 'feed' && !isBreastFeed(form.feed_type) && form.amount_ml
          ? Number(form.amount_ml)
          : null,
      duration_mins:
        activeType === 'feed' && isBreastFeed(form.feed_type) && form.duration_mins
          ? Number(form.duration_mins)
          : null,
      feed_type: activeType === 'feed' ? form.feed_type : null,
      nappy_type: activeType === 'nappy' ? form.nappy_type : null,
      medication_name: activeType === 'med' ? form.medication_name : null,
      medication_dose: activeType === 'med' ? form.medication_dose : null,
      notes: form.notes || null,
    }

    if (!supabase || usingImportedData || !babyId) {
      setEntries((current) =>
        [payload, ...current].sort(
          (a, b) => new Date(b.happened_at).getTime() - new Date(a.happened_at).getTime(),
        ),
      )
      setForm(initialForm())
      setSaving(false)
      setMessage('Saved locally in this browser session.')
      return
    }

    const { id: _localId, ...insertPayload } = payload
    const { error } = await supabase.from('baby_entries').insert(insertPayload)
    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setForm(initialForm())
    await loadEntries()
  }

  async function deleteEntry(entry: BabyEntry) {
    setMessage('')

    if (!supabase || usingImportedData || !babyId) {
      setEntries((current) => current.filter((item) => item.id !== entry.id))
      setMessage('Entry deleted locally.')
      return
    }

    const { error } = await supabase.from('baby_entries').delete().eq('id', entry.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setEntries((current) => current.filter((item) => item.id !== entry.id))
  }

  function openProfile() {
    setProfileForm(profile)
    setPhotoDraft(babyPhoto)
    setCurrentPage('profile')
    setAccountMenuOpen(false)
  }

  async function saveProfile() {
    const nextProfile = { ...profileForm, photoUrl: photoDraft || profileForm.photoUrl }

    if (supabase && session && babyId) {
      let photoUrl = nextProfile.photoUrl
      if (photoDraft && photoDraft.startsWith('data:')) {
        const response = await fetch(photoDraft)
        const blob = await response.blob()
        const path = `${babyId}/${Date.now()}-profile-photo`
        const { error: uploadError } = await supabase.storage
          .from('baby-photos')
          .upload(path, blob, { upsert: true })

        if (uploadError) {
          setMessage(uploadError.message)
          return
        }

        photoUrl = supabase.storage.from('baby-photos').getPublicUrl(path).data.publicUrl
      }

      const { data, error } = await supabase
        .from('babies')
        .update(toBabyRow({ ...nextProfile, photoUrl }))
        .eq('id', babyId)
        .select('*')
        .single()

      if (error) {
        setMessage(error.message)
        return
      }

      const cloudProfile = fromBabyRow(data)
      setProfile(cloudProfile)
      setBabyPhoto(cloudProfile.photoUrl || '')
      setProfileForm(cloudProfile)
    } else {
      setProfile(nextProfile)
      setBabyPhoto(photoDraft)
    }

    setCurrentPage('tracker')
    setMessage("Baby profile updated.")
  }

  function uploadPhoto(file: File | undefined) {
    if (!file) return

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') setPhotoDraft(reader.result)
    })
    reader.readAsDataURL(file)
  }

  async function copyShareLink() {
    await navigator.clipboard.writeText(shareLink)
    setMessage('Share link copied.')
  }

  async function shareAccount() {
    if (!navigator.share) {
      await copyShareLink()
      return
    }

    await navigator.share({
      title: `${profile.name} baby tracker`,
      text: partnerEmail ? `Invite for ${partnerEmail}` : 'Baby tracker invite',
      url: shareLink,
    })
  }

  const rollingSummary = useMemo(() => {
    const now = Date.now()
    const dayAgo = now - 24 * 60 * 60 * 1000
    const recentEntries = entries.filter((entry) => {
      const happenedAt = new Date(entry.happened_at).getTime()
      return happenedAt >= dayAgo && happenedAt <= now
    })

    return {
      feeds: recentEntries.filter((entry) => entry.type === 'feed').length,
      nappies: recentEntries.filter((entry) => entry.type === 'nappy').length,
      meds: recentEntries.filter((entry) => entry.type === 'med').length,
      ml: Math.round(recentEntries.reduce((sum, entry) => sum + getEstimatedMilkMl(entry), 0)),
    }
  }, [entries])

  const activeEntries = useMemo(
    () =>
      entries
        .filter((entry) => entry.type === activeType)
        .toSorted(
          (a, b) => new Date(b.happened_at).getTime() - new Date(a.happened_at).getTime(),
        ),
    [activeType, entries],
  )

  if (loading) return <main className="loading-screen">Loading...</main>

  return (
    <main className="app-shell">
      <div className="app-container">
        <header className="app-header">
          <div>
            <h1>{profile.name}</h1>
            <p>
              {currentPage === 'profile'
                ? "Update your baby's core information."
                : 'Feeds, nappies and meds in one shared place.'}
            </p>
          </div>
          <div className="account-menu-wrap">
            <button
              className="account-button"
              type="button"
              aria-label="Open account menu"
              aria-expanded={accountMenuOpen}
              onClick={() => setAccountMenuOpen((open) => !open)}
            >
              <UserCircle aria-hidden="true" />
              <ChevronDown aria-hidden="true" />
            </button>
            {accountMenuOpen && (
              <div className="account-menu">
                <button type="button" onClick={openProfile}>
                  <User aria-hidden="true" />
                  Profile
                </button>
                {session ? (
                  <button type="button" onClick={signOut}>
                    <LogOut aria-hidden="true" />
                    Logout
                  </button>
                ) : (
                  <div className="menu-login">
                    <input
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                    <button type="button" onClick={() => void signIn()} disabled={!email}>
                      <LogOut aria-hidden="true" />
                      Send magic link
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {currentPage === 'profile' ? (
          <section className="panel profile-editor">
            <button className="text-action" type="button" onClick={() => setCurrentPage('tracker')}>
              <ArrowLeft aria-hidden="true" />
              Back
            </button>
            <div className="photo-upload">
              <div className="photo-preview">
                {photoDraft ? (
                  <img src={photoDraft} alt={`${profileForm.name} profile`} />
                ) : (
                  <Baby aria-hidden="true" />
                )}
              </div>
              <label className="upload-control">
                Baby photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => uploadPhoto(event.target.files?.[0])}
                />
              </label>
            </div>
            <div className="profile-form-grid">
              <label>
                Baby name
                <input
                  value={profileForm.name}
                  onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })}
                />
              </label>
              <label>
                Birth date
                <input
                  value={profileForm.birthDate}
                  onChange={(event) =>
                    setProfileForm({ ...profileForm, birthDate: event.target.value })
                  }
                />
              </label>
              <label>
                Birth time
                <input
                  value={profileForm.birthTime}
                  onChange={(event) =>
                    setProfileForm({ ...profileForm, birthTime: event.target.value })
                  }
                />
              </label>
              <label>
                Birth weight (kg)
                <input
                  type="number"
                  step="0.01"
                  value={profileForm.birthWeightKg}
                  onChange={(event) =>
                    setProfileForm({
                      ...profileForm,
                      birthWeightKg: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Birth type
                <input
                  value={profileForm.birthType}
                  onChange={(event) =>
                    setProfileForm({ ...profileForm, birthType: event.target.value })
                  }
                />
              </label>
              <label>
                Complications
                <input
                  value={profileForm.complications}
                  onChange={(event) =>
                    setProfileForm({ ...profileForm, complications: event.target.value })
                  }
                />
              </label>
            </div>
            <button className="primary-action" type="button" onClick={() => void saveProfile()}>
              <Save aria-hidden="true" />
              Save profile
            </button>
            <section className="share-panel" aria-label="Share account">
              <div>
                <h2>Share with partner</h2>
                <p>Send the link or let them scan the QR code from their phone.</p>
              </div>
              <div className="profile-form-grid">
                <label>
                  Partner email
                  <input
                    type="email"
                    placeholder="partner@example.com"
                    value={partnerEmail}
                    onChange={(event) => setPartnerEmail(event.target.value)}
                  />
                </label>
                <label>
                  Share link
                  <input value={shareLink} onChange={(event) => setShareLink(event.target.value)} />
                </label>
              </div>
              <div className="qr-share-row">
                <div className="qr-box">
                  {qrCodeUrl ? <img src={qrCodeUrl} alt="Partner share QR code" /> : <QrCode />}
                </div>
                <div className="share-actions">
                  <button className="secondary-action" type="button" onClick={copyShareLink}>
                    <Copy aria-hidden="true" />
                    Copy link
                  </button>
                  <button className="secondary-action" type="button" onClick={shareAccount}>
                    <Share2 aria-hidden="true" />
                    Share
                  </button>
                </div>
              </div>
            </section>
          </section>
        ) : (
          <>
        <section className="profile-strip" aria-label="Baby profile">
          {babyPhoto ? (
            <article className="profile-photo-fact">
              <img src={babyPhoto} alt={`${profile.name} profile`} />
            </article>
          ) : null}
          <ProfileFact label="Born" value={`${profile.birthDate}, ${profile.birthTime}`} />
          <ProfileFact label="Weight" value={`${profile.birthWeightKg}kg`} />
          <ProfileFact label="Birth" value={profile.birthType} />
          <ProfileFact label="Complications" value={profile.complications} />
        </section>

        <section className="summary-grid" aria-label="Last 24 hours summary">
          <SummaryCard label="Feeds 24h" value={rollingSummary.feeds} />
          <SummaryCard label="Milk 24h" value={`${rollingSummary.ml}ml`} />
          <SummaryCard label="Nappies 24h" value={rollingSummary.nappies} />
          <SummaryCard label="Meds 24h" value={rollingSummary.meds} />
        </section>

        <section className="panel entry-panel">
          <div className="type-grid">
            {Object.entries(entryTypes).map(([key, item]) => {
              const Icon = item.icon
              const isActive = activeType === key

              return (
                <button
                  key={key}
                  onClick={() => setActiveType(key as EntryType)}
                  className={isActive ? 'type-button active' : 'type-button'}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>

          <label className="field-label">
            <CalendarDays aria-hidden="true" />
            Time
          </label>
          <input
            type="datetime-local"
            value={form.happened_at}
            onChange={(event) => setForm({ ...form, happened_at: event.target.value })}
          />

          {activeType === 'feed' && (
            <div className="two-column">
              <select
                value={form.feed_type}
                onChange={(event) =>
                  setForm({
                    ...form,
                    feed_type: event.target.value,
                    amount_ml: '',
                    duration_mins: '',
                  })
                }
              >
                <option>Bottle</option>
                <option>Breast</option>
                <option>Formula</option>
                <option>Expressed</option>
              </select>
              {isBreastFeed(form.feed_type) ? (
                <input
                  type="number"
                  placeholder="Duration (mins)"
                  value={form.duration_mins}
                  onChange={(event) => setForm({ ...form, duration_mins: event.target.value })}
                />
              ) : (
                <input
                  type="number"
                  placeholder="Amount ml"
                  value={form.amount_ml}
                  onChange={(event) => setForm({ ...form, amount_ml: event.target.value })}
                />
              )}
            </div>
          )}

          {activeType === 'nappy' && (
            <select
              value={form.nappy_type}
              onChange={(event) => setForm({ ...form, nappy_type: event.target.value })}
            >
              <option>Wet</option>
              <option>Dirty</option>
              <option>Wet + dirty</option>
              <option>Dry</option>
            </select>
          )}

          {activeType === 'med' && (
            <div className="two-column">
              <input
                placeholder="Medication"
                value={form.medication_name}
                onChange={(event) => setForm({ ...form, medication_name: event.target.value })}
              />
              <input
                placeholder="Dose"
                value={form.medication_dose}
                onChange={(event) => setForm({ ...form, medication_dose: event.target.value })}
              />
            </div>
          )}

          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
          <button className="primary-action" onClick={addEntry} disabled={saving}>
            <Plus aria-hidden="true" />
            {saving ? 'Saving...' : 'Add entry'}
          </button>
          {message && <p className="message">{message}</p>}
        </section>

        <section className="recent-section">
          <h2>Recent {entryTypes[activeType].label.toLowerCase()} entries</h2>
          {activeEntries.length === 0 && (
            <p className="empty-state">
              No {entryTypes[activeType].label.toLowerCase()} entries yet.
            </p>
          )}
          {activeEntries.map((entry) => {
            const Icon = entryTypes[entry.type]?.icon || Baby

            return (
              <article key={entry.id} className="panel entry-card">
                <div className="entry-icon">
                  <Icon aria-hidden="true" />
                </div>
                <div className="entry-body">
                  <div className="entry-title-row">
                    <h3>{entry.type}</h3>
                    <div className="entry-actions">
                      <time>{formatTime(entry.happened_at)}</time>
                      <button
                        className="icon-action danger-action"
                        type="button"
                        aria-label={`Delete ${entry.type} entry from ${formatTime(entry.happened_at)}`}
                        onClick={() => void deleteEntry(entry)}
                        title="Delete entry"
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <p>
                    {entry.type === 'feed' &&
                      `${entry.feed_type || 'Feed'}${entry.amount_ml ? ` - ${entry.amount_ml}ml` : ''}${
                        entry.duration_mins
                          ? ` - ${entry.duration_mins} mins${
                              entry.feed_type?.toLowerCase().includes('breast')
                                ? ` - est. ${Math.round(entry.duration_mins * 7)}ml`
                                : ''
                            }`
                          : ''
                      }`}
                    {entry.type === 'nappy' && entry.nappy_type}
                    {entry.type === 'med' &&
                      `${entry.medication_name || 'Medication'}${
                        entry.medication_dose ? ` - ${entry.medication_dose}` : ''
                      }`}
                  </p>
                  {entry.notes && <p className="entry-notes">{entry.notes}</p>}
                </div>
              </article>
            )
          })}
        </section>
          </>
        )}
      </div>
    </main>
  )
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="panel summary-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}

function ProfileFact({ label, value }: { label: string; value: string | number }) {
  return (
    <article>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}
