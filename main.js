/* PRO-LOGIC — Bitfocus Companion module: Live Graphics, Stage Timer, Presenter, Teleprompter, Take Board and Intercom
 * from one connection.
 * Talks to /api/control on the Pro-Logic app (see app/api/control/route.ts for the full action list).
 * Config: base URL, output token and control key. Both are shown in the app under "Stream Deck / Companion"
 * (Live Graphics → Output URL, and in the Stage Timer, Presenter and Teleprompter consoles). */

const { InstanceBase, runEntrypoint, InstanceStatus, combineRgb } = require('@companion-module/base')

/* The Broadcast skin: one image per key and one for its lit state (built by skin/build.mjs). Without the file the keys
 * fall back to plain text, so the module still runs. */
let SKIN = {}
try { SKIN = require('./skin.js') } catch (e) { SKIN = {} }

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const RED = combineRgb(220, 30, 40)
const GREEN = combineRgb(20, 160, 70)
const AMBER = combineRgb(245, 158, 11)
const DARK = combineRgb(30, 30, 34)
const CELL = combineRgb(15, 21, 27)   // the skin's own dark, behind a key image

const GRAPHICS = [
  { id: 'bug', label: 'Score Bug' }, { id: 'pbp', label: 'PBP Rail' }, { id: 'ticker', label: 'Ticker' },
  { id: 'net', label: 'Network Logo' }, { id: 'talent', label: 'Talent' }, { id: 'mention', label: 'Mention' },
  { id: 'foul', label: 'Foul' }, { id: 'portal', label: 'Hoop Portal' }, { id: 'shotTrail', label: 'Shot Trail' },
  { id: 'shotMtn', label: 'Shot Terrain' }, { id: 'slam', label: 'SLAM' }, { id: 'projection', label: 'Projection' },
]
const FLAG_KEY = { bug: 'bug', pbp: 'pbp', ticker: 'pbpTicker', net: 'net', talent: 'talent', mention: 'mention', foul: 'foul',
  portal: 'portal', shotTrail: 'shotTrail', shotMtn: 'shotMtn', slam: 'slam', projection: 'projection' }
const FULLS = [
  { id: 'lineups', label: 'Lineups' }, { id: 'teamstats', label: 'Team Stats' }, { id: 'leaders', label: 'Leaders' },
  { id: 'matchup', label: 'Matchup' }, { id: 'linescore', label: 'Line Score' }, { id: 'shotchart', label: 'Shot Chart' },
  { id: 'assists', label: 'Assists' }, { id: 'matchupbanner', label: 'Matchup Banner' }, { id: 'taletape', label: 'Tale of the Tape' },
  { id: 'boxscore', label: 'Box Score' }, { id: 'trivia', label: 'Trivia' }, { id: 'nextgame', label: 'Next Game' },
  { id: 'breaker', label: 'Commercial Break' }, { id: 'final', label: 'Final Score' },
  { id: 'momentum', label: 'Momentum' }, { id: 'battle', label: 'Team Battle' }, { id: 'zones', label: 'Shot Zones' },
  { id: 'impact', label: 'Player Impact' }, { id: 'units', label: 'Best Lineups' },
]
const PLAYS = [
  { id: '3pt', label: '3PT' }, { id: '2pt', label: '+2' }, { id: 'ft', label: '+1 FT' },
  { id: 'ast', label: 'Assist' }, { id: 'dd', label: 'Double-Double' }, { id: 'td', label: 'Triple-Double' },
]
const FLAG_TITLES = ['TIMEOUT', 'FULL TIMEOUT', 'TEAM FOUL', 'CHALLENGE'].map(t => ({ id: t, label: t }))
const BUSES = [{ id: 'program', label: 'Program (air)' }, { id: 'preview', label: 'Preview (stage)' }]
const SIDES = [{ id: 'home', label: 'Home' }, { id: 'away', label: 'Away' }]
const BLUE = combineRgb(14, 116, 190)
const TIMER_ACTIONS = [
  { id: 'toggle', label: 'Start / Pause' }, { id: 'start', label: 'Start' }, { id: 'pause', label: 'Pause' }, { id: 'stop', label: 'Stop' },
  { id: 'restart', label: 'Restart' }, { id: 'plus', label: '+1 minute' }, { id: 'minus', label: '-1 minute' },
  { id: 'next', label: 'Next cue' }, { id: 'prev', label: 'Previous cue' },
]
const PRESENTER_ACTIONS = [{ id: 'next', label: 'Next slide' }, { id: 'prev', label: 'Previous slide' }, { id: 'blank', label: 'Blank on / off' }]
const TAKE_ACTIONS = [
  { id: 'clap', label: 'CLAP (sync flash + beep)' }, { id: 'roll', label: 'Roll / Cut' }, { id: 'good', label: 'Mark GOOD (circle take)' },
  { id: 'ng', label: 'Mark NO GOOD' }, { id: 'hold', label: 'Mark HOLD' }, { id: 'next', label: 'Take +1' }, { id: 'prev', label: 'Take -1' },
  { id: 'shot', label: 'New shot' }, { id: 'scene', label: 'New scene' },
]
const FLOOR_MSGS = ['Quiet please', 'Last looks', 'Moving on', 'Lunch 30', 'Wrap']
const PROMPTER_ACTIONS = [
  { id: 'toggle', label: 'Play / Pause' }, { id: 'faster', label: 'Faster (+10 WPM)' }, { id: 'slower', label: 'Slower (-10 WPM)' },
  { id: 'top', label: 'Back to top' }, { id: 'back', label: 'Jump back' }, { id: 'ahead', label: 'Jump ahead' },
]

/* Take Board: what the deck shows about the slate */
const mmss = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
const takeVars = t => (t && t.live !== false && t.scene !== undefined ? {
  tb_scene: t.scene, tb_shot: t.shot, tb_take: String(t.take), tb_slate: `${t.scene}${t.shot}-${t.take}`,
  tb_state: t.rolling ? 'ROLLING' : 'CUT', tb_roll: t.rolling && t.rollSec != null ? mmss(t.rollSec) : '',
  tb_status: { good: 'GOOD', ng: 'NG', hold: 'HOLD' }[t.status] || '', tb_good: String(t.good), tb_ng: String(t.ng), tb_message: t.message || '',
} : { tb_scene: '', tb_shot: '', tb_take: '', tb_slate: '', tb_state: '', tb_roll: '', tb_status: '', tb_good: '', tb_ng: '', tb_message: '' })

/* Intercom: what the deck shows about the director's beltpack */
const IC_CHANNELS = 8
const icVars = i => {
  const on = !!(i && i.live && i.names)
  const v = { ic_room: on ? i.room || '' : '', ic_talk: on && i.talkCh ? i.names[i.talkCh - 1] || '' : '',
    ic_state: !on ? 'OFFLINE' : i.muted ? 'MUTED' : i.latch ? 'LATCHED' : i.talking ? 'TALKING' : 'READY' }
  for (let n = 1; n <= IC_CHANNELS; n++) v[`ic_ch${n}`] = on ? i.names[n - 1] || '' : ''
  return v
}

class ProLogicInstance extends InstanceBase {
  async init(config) {
    this.config = config
    this.state = null
    this.polling = null
    this.setActionDefinitions(this.actions())
    this.setFeedbackDefinitions(this.feedbacks())
    this.setVariableDefinitions(this.variableDefs())
    this.setPresetDefinitions(this.presets())
    this.startPolling()
  }

  async destroy() { clearInterval(this.timer); for (const h of (this.icHeld || new Map()).values()) clearInterval(h.t) }

  async configUpdated(config) {
    this.config = config
    this.setPresetDefinitions(this.presets())
    this.startPolling()
  }

  getConfigFields() {
    return [
      { type: 'textinput', id: 'base', label: 'App URL', width: 12, default: 'https://pro-logic.studio' },
      { type: 'textinput', id: 'token', label: 'Output token', width: 12, default: '' },
      { type: 'textinput', id: 'key', label: 'Control key', width: 12, default: '' },
      { type: 'number', id: 'poll', label: 'Feedback poll (ms)', width: 6, default: 500, min: 250, max: 5000 },
      { type: 'dropdown', id: 'skin', label: 'Look of the preset keys', width: 6, default: 'broadcast', choices: [{ id: 'broadcast', label: 'Broadcast (icons, lit when on)' }, { id: 'plain', label: 'Plain text' }] },
      { type: 'checkbox', id: 'withPresenter', label: 'Follow Presenter (slide on screen, blank)', width: 6, default: true },
      { type: 'checkbox', id: 'withPrompter', label: 'Follow Teleprompter (playing, speed)', width: 6, default: true },
      { type: 'checkbox', id: 'withTake', label: 'Follow Take Board (slate, rolling, last mark)', width: 6, default: true },
      { type: 'checkbox', id: 'withIntercom', label: 'Follow Intercom (talking, listening, who is on a channel)', width: 6, default: true },
      { type: 'textinput', id: 'homeNums', label: 'Home jerseys for presets (comma list)', width: 12, default: '1,2,4,5,6,14,15,17,25,30,32,33,55' },
      { type: 'textinput', id: 'awayNums', label: 'Away jerseys for presets (comma list)', width: 12, default: '1,2,3,5,8,10,11,13,15,18,24,27,55' },
      { type: 'textinput', id: 'homeAbbr', label: 'Home team abbr', width: 6, default: 'AUS' },
      { type: 'textinput', id: 'awayAbbr', label: 'Away team abbr', width: 6, default: 'AWAY' },
    ]
  }

  url(params) {
    const base = String(this.config.base || '').replace(/\/$/, '')
    const q = new URLSearchParams({ token: this.config.token || '', key: this.config.key || '', ...params })
    return `${base}/api/control?${q.toString()}`
  }

  async call(params, refresh = true) {
    if (!this.config.token || !this.config.key) { this.updateStatus(InstanceStatus.BadConfig, 'Token and key required'); return null }
    try {
      const res = await fetch(this.url(params), { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { this.log('warn', `${params.do}: ${j.error || res.status}`); return null }
      if (refresh) await this.poll(true)   // refresh feedback right away instead of waiting for the next tick
      return j
    } catch (e) {
      this.updateStatus(InstanceStatus.ConnectionFailure, String(e.message || e))
      return null
    }
  }

  /* Talk is held only while the key is down: the module repeats "on" every 0.8 s and the beltpack lets go by itself
     2.5 s after the last one, so a lost key-up (network, Companion closed) can never leave the microphone open.
     A key held for more than 10 minutes is let go too. */
  icTalk(ch, on) {
    this.icHeld = this.icHeld || new Map()
    const h = this.icHeld.get(ch); if (h) { clearInterval(h.t); this.icHeld.delete(ch) }
    if (on) {
      const since = Date.now()
      const t = setInterval(() => {
        if (Date.now() - since > 600000) { this.icTalk(ch, false); return }
        this.call({ do: 'intercom', a: 'talk', ch: String(ch), v: 'on' }, false)
      }, 800)
      this.icHeld.set(ch, { t })
    }
    return this.call({ do: 'intercom', a: 'talk', ch: String(ch), v: on ? 'on' : 'off' })
  }

  startPolling() {
    clearInterval(this.timer)
    if (!this.config.token || !this.config.key) { this.updateStatus(InstanceStatus.BadConfig, 'Token and key required'); return }
    this.updateStatus(InstanceStatus.Connecting)
    this.timer = setInterval(() => this.poll(), Math.max(250, Number(this.config.poll) || 500))
    this.poll()
  }

  /* One request in flight at a time. A forced poll (after an action) that lands while one is running waits for it
     and then reads again, so the buttons never light from a state read before the action. */
  async poll(force = false) {
    if (this.polling) {
      if (!force) return
      await this.polling
      return this.poll(true)
    }
    let done
    this.polling = new Promise(r => { done = r })
    try {
      const follow = [this.config.withPresenter !== false ? 'presenter' : '', this.config.withPrompter !== false ? 'prompter' : '', this.config.withTake !== false ? 'take' : '', this.config.withIntercom !== false ? 'intercom' : ''].filter(Boolean).join(',')
      const res = await fetch(this.url(follow ? { do: 'state', with: follow } : { do: 'state' }))
      if (res.status === 403) { this.updateStatus(InstanceStatus.AuthenticationFailure, 'Bad control key'); return }
      if (!res.ok) { this.updateStatus(InstanceStatus.UnknownError, `HTTP ${res.status}`); return }
      this.state = await res.json()
      this.updateStatus(InstanceStatus.Ok)
      const s = this.state, pg = s.program || {}, pv = s.preview || {}
      this.setVariableValues({
        away: s.away ?? '', home: s.home ?? '', clock: s.clock ?? '', period: s.period ?? '', shot: s.shot ?? '',
        full_program: pg.full || '', full_preview: pv.full || '',
        callout: s.callout ? `${s.callout.title} ${s.callout.sub || ''}`.trim() : '',
        timer: s.timer ? s.timer.text : '', timer_name: s.timer ? s.timer.name : '', timer_state: s.timer ? (s.timer.running ? 'RUN' : 'STOP') : '',
        timer_message: s.timer ? s.timer.message : '',
        slide: s.presenter ? (s.presenter.blank ? 'BLANK' : s.presenter.label || s.presenter.text || '') : '',
        slide_text: s.presenter ? s.presenter.text || '' : '', slide_next: s.presenter ? s.presenter.nextLabel || s.presenter.nextText || '' : '',
        slide_item: s.presenter ? s.presenter.item || '' : '',
        prompter_wpm: s.prompter && s.prompter.wpm ? String(s.prompter.wpm) : '', prompter_state: s.prompter ? (s.prompter.playing ? 'PLAY' : 'PAUSE') : '',
        ...takeVars(s.take),
        ...icVars(s.intercom),
      })
      this.checkFeedbacks()
    } catch (e) {
      this.updateStatus(InstanceStatus.ConnectionFailure, String(e.message || e))
    } finally {
      this.polling = null
      done()
    }
  }

  bus(o) { return o.bus === 'preview' ? { bus: 'preview' } : {} }
  busState(o) { return (this.state && (o.bus === 'preview' ? this.state.preview : this.state.program)) || {} }

  actions() {
    const busOpt = { type: 'dropdown', id: 'bus', label: 'Bus', default: 'program', choices: BUSES }
    const teamOpt = { type: 'textinput', id: 'team', label: 'Team (abbr, home or away)', default: 'home' }
    const numOpt = { type: 'textinput', id: 'num', label: 'Jersey number', default: '' }
    return {
      graphic: {
        name: 'Graphic on / off',
        options: [
          { type: 'dropdown', id: 'g', label: 'Graphic', default: 'bug', choices: GRAPHICS },
          { type: 'dropdown', id: 'mode', label: 'Mode', default: 'toggle', choices: [{ id: 'toggle', label: 'Toggle' }, { id: 'on', label: 'On' }, { id: 'off', label: 'Off' }] },
          busOpt,
        ],
        callback: async e => { await this.call({ do: e.options.mode, g: e.options.g, ...this.bus(e.options) }) },
      },
      full: {
        name: 'Full screen (toggle)',
        options: [{ type: 'dropdown', id: 'g', label: 'Screen', default: 'lineups', choices: [...FULLS, { id: 'none', label: 'None (clear full screen)' }] }, busOpt],
        callback: async e => { await this.call({ do: 'full', g: e.options.g, ...this.bus(e.options) }) },
      },
      lower: {
        name: 'Player lower third (toggle)',
        options: [teamOpt, numOpt, busOpt],
        callback: async e => { await this.call({ do: 'lower', team: e.options.team, num: e.options.num, ...this.bus(e.options) }) },
      },
      atl: {
        name: 'At The Line (toggle)',
        options: [teamOpt, numOpt, busOpt],
        callback: async e => { await this.call({ do: 'atl', team: e.options.team, num: e.options.num, ...this.bus(e.options) }) },
      },
      play: {
        name: 'Player play callout (toggle)',
        options: [{ type: 'dropdown', id: 'kind', label: 'Play', default: '3pt', choices: PLAYS }, teamOpt, numOpt],
        callback: async e => { await this.call({ do: 'play', kind: e.options.kind, team: e.options.team, num: e.options.num }) },
      },
      flag: {
        name: 'Team flag (toggle)',
        options: [
          { type: 'dropdown', id: 'side', label: 'Team', default: 'home', choices: SIDES },
          { type: 'dropdown', id: 'title', label: 'Flag', default: 'TIMEOUT', choices: FLAG_TITLES, allowCustom: true },
          busOpt,
        ],
        callback: async e => { await this.call({ do: 'flag', side: e.options.side, title: e.options.title, ...this.bus(e.options) }) },
      },
      msg: {
        name: 'Header message (empty clears)',
        options: [{ type: 'textinput', id: 'text', label: 'Text', default: '', useVariables: true }, busOpt],
        callback: async (e, ctx) => {
          const text = await ctx.parseVariablesInString(e.options.text || '')
          await this.call({ do: 'msg', text, ...this.bus(e.options) })
        },
      },
      timer: {
        name: 'Stage Timer: transport',
        options: [{ type: 'dropdown', id: 'a', label: 'Action', default: 'toggle', choices: TIMER_ACTIONS }],
        callback: async e => { await this.call({ do: 'timer', a: e.options.a }) },
      },
      timer_cue: {
        name: 'Stage Timer: go to cue',
        options: [
          { type: 'number', id: 'n', label: 'Cue number (1 = first)', default: 1, min: 1, max: 200 },
          { type: 'checkbox', id: 'start', label: 'Start it at once', default: true },
        ],
        callback: async e => { await this.call({ do: 'timer', a: e.options.start ? 'go' : 'select', v: String(e.options.n) }) },
      },
      timer_speed: {
        name: 'Stage Timer: speed',
        options: [{ type: 'number', id: 'pct', label: 'Speed (%)', default: 100, min: 10, max: 400 }],
        callback: async e => { await this.call({ do: 'timer', a: 'speed', v: String(e.options.pct) }) },
      },
      presenter: {
        name: 'Presenter: slide control',
        options: [{ type: 'dropdown', id: 'a', label: 'Action', default: 'next', choices: PRESENTER_ACTIONS }],
        callback: async e => { await this.call({ do: 'presenter', a: e.options.a }) },
      },
      prompter: {
        name: 'Teleprompter: control',
        options: [{ type: 'dropdown', id: 'a', label: 'Action', default: 'toggle', choices: PROMPTER_ACTIONS }],
        callback: async e => { await this.call({ do: 'prompter', a: e.options.a }) },
      },
      prompter_wpm: {
        name: 'Teleprompter: set speed',
        options: [{ type: 'number', id: 'wpm', label: 'Words per minute', default: 130, min: 40, max: 300 }],
        callback: async e => { await this.call({ do: 'prompter', a: 'wpm', v: String(e.options.wpm) }) },
      },
      take: { name: 'TAKE (preview to air)', options: [], callback: async () => { await this.call({ do: 'take' }) } },
      take_board: {
        name: 'Take Board: slate',
        options: [{ type: 'dropdown', id: 'a', label: 'Action', default: 'clap', choices: TAKE_ACTIONS }],
        callback: async e => { await this.call({ do: 'take', a: e.options.a }) },
      },
      take_board_msg: {
        name: 'Take Board: message to the floor (empty clears)',
        options: [{ type: 'textinput', id: 'text', label: 'Message', default: 'Quiet please', useVariables: true }],
        callback: async (e, ctx) => { await this.call({ do: 'take', a: 'msg', v: await ctx.parseVariablesInString(e.options.text || '') }) },
      },
      ic_talk: {
        name: 'Intercom: talk (put "Key down" on the press and "Key up" on the release)',
        options: [
          { type: 'number', id: 'ch', label: 'Channel (1 = the first)', default: 1, min: 1, max: IC_CHANNELS },
          { type: 'dropdown', id: 'mode', label: 'Step', default: 'press', choices: [{ id: 'press', label: 'Key down: start talking' }, { id: 'release', label: 'Key up: stop talking' }] },
        ],
        callback: async e => { await this.icTalk(Number(e.options.ch) || 1, e.options.mode !== 'release') },
      },
      ic_latch: {
        name: 'Intercom: latch talk on / off',
        options: [{ type: 'number', id: 'ch', label: 'Channel (0 = the one already selected)', default: 0, min: 0, max: IC_CHANNELS }],
        callback: async e => { const ch = Number(e.options.ch) || 0; await this.call({ do: 'intercom', a: 'latch', ...(ch ? { ch: String(ch) } : {}) }) },
      },
      ic_listen: {
        name: 'Intercom: listen to a channel on / off',
        options: [{ type: 'number', id: 'ch', label: 'Channel (1 = the first)', default: 1, min: 1, max: IC_CHANNELS }],
        callback: async e => { await this.call({ do: 'intercom', a: 'listen', ch: String(Number(e.options.ch) || 1) }) },
      },
      ic_mute: { name: 'Intercom: microphone mute on / off', options: [], callback: async () => { await this.call({ do: 'intercom', a: 'mute' }) } },
      ic_call: { name: 'Intercom: call everyone (beep and flash)', options: [], callback: async () => { await this.call({ do: 'intercom', a: 'call' }) } },
      clear: { name: 'CLEAR program', options: [], callback: async () => { await this.call({ do: 'clear' }) } },
      clearpvw: { name: 'CLEAR preview', options: [], callback: async () => { await this.call({ do: 'clearpvw' }) } },
    }
  }

  feedbacks() {
    const busOpt = { type: 'dropdown', id: 'bus', label: 'Bus', default: 'program', choices: BUSES }
    const onAir = { bgcolor: RED, color: WHITE }
    return {
      graphic_on: {
        type: 'boolean', name: 'Graphic is on', defaultStyle: onAir,
        options: [{ type: 'dropdown', id: 'g', label: 'Graphic', default: 'bug', choices: GRAPHICS }, busOpt],
        callback: f => !!this.busState(f.options)[FLAG_KEY[f.options.g]],
      },
      full_on: {
        type: 'boolean', name: 'Full screen is on', defaultStyle: onAir,
        options: [{ type: 'dropdown', id: 'g', label: 'Screen', default: 'lineups', choices: FULLS }, busOpt],
        callback: f => this.busState(f.options).full === f.options.g,
      },
      flag_on: {
        type: 'boolean', name: 'Team flag is on', defaultStyle: onAir,
        options: [
          { type: 'dropdown', id: 'side', label: 'Team', default: 'home', choices: SIDES },
          { type: 'dropdown', id: 'title', label: 'Flag', default: 'TIMEOUT', choices: FLAG_TITLES, allowCustom: true },
          busOpt,
        ],
        callback: f => { const t = this.busState(f.options).teamFlag; return !!t && t.side === f.options.side && t.title === f.options.title },
      },
      play_on: {
        type: 'boolean', name: 'Play callout is held', defaultStyle: onAir,
        options: [
          { type: 'dropdown', id: 'kind', label: 'Play', default: '3pt', choices: PLAYS },
          { type: 'textinput', id: 'num', label: 'Jersey number (empty = any)', default: '' },
        ],
        callback: f => {
          const c = this.state && this.state.callout
          if (!c || c.kind !== f.options.kind) return false
          return !f.options.num || String(c.sub || '').startsWith(`#${f.options.num} `)
        },
      },
      timer_running: {
        type: 'boolean', name: 'Stage Timer is running', defaultStyle: { bgcolor: GREEN, color: WHITE }, options: [],
        callback: () => !!(this.state && this.state.timer && this.state.timer.running),
      },
      timer_color: {
        type: 'boolean', name: 'Stage Timer colour is', defaultStyle: { bgcolor: RED, color: WHITE },
        options: [{ type: 'dropdown', id: 'c', label: 'Colour', default: 'red', choices: [{ id: 'green', label: 'Green (time left)' }, { id: 'amber', label: 'Amber (warning)' }, { id: 'red', label: 'Red (final / over time)' }] }],
        callback: f => !!(this.state && this.state.timer && this.state.timer.color === f.options.c),
      },
      presenter_blank: {
        type: 'boolean', name: 'Presenter is blank', defaultStyle: onAir, options: [],
        callback: () => !!(this.state && this.state.presenter && this.state.presenter.blank),
      },
      presenter_live: {
        type: 'boolean', name: 'Presenter is broadcasting', defaultStyle: { bgcolor: GREEN, color: WHITE }, options: [],
        callback: () => !!(this.state && this.state.presenter && this.state.presenter.live),
      },
      prompter_playing: {
        type: 'boolean', name: 'Teleprompter is rolling', defaultStyle: { bgcolor: GREEN, color: WHITE }, options: [],
        callback: () => !!(this.state && this.state.prompter && this.state.prompter.playing),
      },
      take_rolling: {
        type: 'boolean', name: 'Take Board: camera rolling', defaultStyle: onAir, options: [],
        callback: () => !!(this.state && this.state.take && this.state.take.rolling),
      },
      take_last: {
        type: 'boolean', name: 'Take Board: last take was marked', defaultStyle: { bgcolor: GREEN, color: WHITE },
        options: [{ type: 'dropdown', id: 's', label: 'Mark', default: 'good', choices: [{ id: 'good', label: 'GOOD' }, { id: 'ng', label: 'NO GOOD' }, { id: 'hold', label: 'HOLD' }] }],
        callback: f => !!(this.state && this.state.take && !this.state.take.rolling && this.state.take.status === f.options.s),
      },
      take_message: {
        type: 'boolean', name: 'Take Board: this message is on the floor', defaultStyle: { bgcolor: AMBER, color: BLACK },
        options: [{ type: 'textinput', id: 'text', label: 'Message', default: 'Quiet please' }],
        callback: f => !!(this.state && this.state.take && this.state.take.message && this.state.take.message === f.options.text),
      },
      ic_talking: {
        type: 'boolean', name: 'Intercom: the director is talking', defaultStyle: { bgcolor: RED, color: WHITE },
        options: [{ type: 'number', id: 'ch', label: 'On channel (0 = any)', default: 0, min: 0, max: IC_CHANNELS }],
        callback: f => { const i = this.state && this.state.intercom; return !!(i && i.talking && (!Number(f.options.ch) || i.talkCh === Number(f.options.ch))) },
      },
      ic_rx: {
        type: 'boolean', name: 'Intercom: somebody is talking on the channel', defaultStyle: { bgcolor: GREEN, color: WHITE },
        options: [{ type: 'number', id: 'ch', label: 'Channel', default: 1, min: 1, max: IC_CHANNELS }],
        callback: f => { const i = this.state && this.state.intercom; return !!(i && i.rx && i.rx.includes(Number(f.options.ch))) },
      },
      ic_listening: {
        type: 'boolean', name: 'Intercom: the director listens to the channel', defaultStyle: { bgcolor: BLUE, color: WHITE },
        options: [{ type: 'number', id: 'ch', label: 'Channel', default: 1, min: 1, max: IC_CHANNELS }],
        callback: f => { const i = this.state && this.state.intercom; return !!(i && i.listen && i.listen.includes(Number(f.options.ch))) },
      },
      ic_latched: {
        type: 'boolean', name: 'Intercom: talk is latched', defaultStyle: { bgcolor: AMBER, color: BLACK }, options: [],
        callback: () => !!(this.state && this.state.intercom && this.state.intercom.latch),
      },
      ic_muted: {
        type: 'boolean', name: 'Intercom: microphone muted', defaultStyle: { bgcolor: RED, color: WHITE }, options: [],
        callback: () => !!(this.state && this.state.intercom && this.state.intercom.muted),
      },
      preview_differs: {
        type: 'boolean', name: 'Preview has something to TAKE', defaultStyle: { bgcolor: GREEN, color: WHITE }, options: [],
        callback: () => {
          if (!this.state) return false
          const a = this.state.program || {}, b = this.state.preview || {}
          return Object.keys(b).some(k => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null))
        },
      },
    }
  }

  variableDefs() {
    return [
      { variableId: 'away', name: 'Away score' }, { variableId: 'home', name: 'Home score' },
      { variableId: 'clock', name: 'Game clock' }, { variableId: 'period', name: 'Period' },
      { variableId: 'shot', name: 'Shot clock' }, { variableId: 'full_program', name: 'Full screen on air' },
      { variableId: 'full_preview', name: 'Full screen in preview' }, { variableId: 'callout', name: 'Held play callout' },
      { variableId: 'timer', name: 'Stage Timer: time (m:ss, - = over time)' }, { variableId: 'timer_name', name: 'Stage Timer: cue name' },
      { variableId: 'timer_state', name: 'Stage Timer: RUN / STOP' }, { variableId: 'timer_message', name: 'Stage Timer: message to the stage' },
      { variableId: 'slide', name: 'Presenter: slide on screen (label, or BLANK)' }, { variableId: 'slide_text', name: 'Presenter: first line on screen' },
      { variableId: 'slide_next', name: 'Presenter: next slide' }, { variableId: 'slide_item', name: 'Presenter: song / item' },
      { variableId: 'prompter_wpm', name: 'Teleprompter: words per minute' }, { variableId: 'prompter_state', name: 'Teleprompter: PLAY / PAUSE' },
      { variableId: 'tb_slate', name: 'Take Board: slate (1A-3)' }, { variableId: 'tb_scene', name: 'Take Board: scene' },
      { variableId: 'tb_shot', name: 'Take Board: shot' }, { variableId: 'tb_take', name: 'Take Board: take' },
      { variableId: 'tb_state', name: 'Take Board: ROLLING / CUT' }, { variableId: 'tb_roll', name: 'Take Board: time rolling (m:ss)' },
      { variableId: 'tb_status', name: 'Take Board: last mark (GOOD / NG / HOLD)' }, { variableId: 'tb_good', name: 'Take Board: good takes this shot' },
      { variableId: 'tb_ng', name: 'Take Board: NG takes this shot' }, { variableId: 'tb_message', name: 'Take Board: message to the floor' },
      { variableId: 'ic_room', name: 'Intercom: room' }, { variableId: 'ic_state', name: 'Intercom: READY / TALKING / LATCHED / MUTED / OFFLINE' },
      { variableId: 'ic_talk', name: 'Intercom: the channel the director talks on' },
      ...Array.from({ length: IC_CHANNELS }, (_, i) => ({ variableId: `ic_ch${i + 1}`, name: `Intercom: name of channel ${i + 1}` })),
    ]
  }

  presets() {
    const p = {}
    const style = (text, size = '14') => ({ text, size, color: WHITE, bgcolor: DARK })
    const btn = (category, name, text, action, options, feedback, fbOptions, extraStyle) => ({
      type: 'button', category, name, style: { ...style(text), ...(extraStyle || {}) },
      steps: [{ down: [{ actionId: action, options }], up: [] }],
      feedbacks: feedback ? [{ feedbackId: feedback, options: fbOptions || options, style: { bgcolor: RED, color: WHITE } }] : [],
    })

    /* The skin: a key with an image shows it full-bleed (no location bar) and its lit feedbacks swap the image.
       `img` is the key's name in skin.js; `keepText` leaves Companion's text on top (numbers, variables). */
    const skinOn = this.config.skin !== 'plain'
    const skin = (preset, img, opts = {}) => {
      if (!skinOn || !SKIN[img]) return preset
      const style = { ...preset.style, png64: SKIN[img], bgcolor: CELL, color: WHITE, show_topbar: false, ...(opts.keepText ? {} : { text: '' }), ...(opts.style || {}) }
      const lit = opts.lit || [`${img}__on`]
      const feedbacks = (preset.feedbacks || []).map((f, i) => (SKIN[lit[i]] ? { ...f, style: { ...f.style, png64: SKIN[lit[i]], ...(opts.litStyle || {}) } } : f))
      return { ...preset, style, feedbacks }
    }

    for (const g of GRAPHICS) p[`g_${g.id}`] = btn('Graphics', g.label, g.label.toUpperCase(), 'graphic', { g: g.id, mode: 'toggle', bus: 'program' }, 'graphic_on', { g: g.id, bus: 'program' })
    for (const f of FULLS) p[`f_${f.id}`] = btn('Full screens', f.label, f.label.toUpperCase(), 'full', { g: f.id, bus: 'program' }, 'full_on', { g: f.id, bus: 'program' })
    for (const s of SIDES) for (const t of FLAG_TITLES) {
      const abbr = s.id === 'home' ? this.config.homeAbbr || 'HOME' : this.config.awayAbbr || 'AWAY'
      p[`flag_${s.id}_${t.id}`] = btn('Team flags', `${abbr} ${t.label}`, `${abbr}\n${t.label}`, 'flag', { side: s.id, title: t.id, bus: 'program' }, 'flag_on', { side: s.id, title: t.id, bus: 'program' })
    }

    p.take = {
      type: 'button', category: 'Control', name: 'TAKE', style: { text: 'TAKE', size: '24', color: WHITE, bgcolor: DARK },
      steps: [{ down: [{ actionId: 'take', options: {} }], up: [] }],
      feedbacks: [{ feedbackId: 'preview_differs', options: {}, style: { bgcolor: GREEN, color: WHITE } }],
    }
    p.clear = { type: 'button', category: 'Control', name: 'CLEAR program', style: { text: 'CLEAR', size: '24', color: WHITE, bgcolor: RED }, steps: [{ down: [{ actionId: 'clear', options: {} }], up: [] }], feedbacks: [] }
    p.clearpvw = { type: 'button', category: 'Control', name: 'CLEAR preview', style: { text: 'CLEAR\nPVW', size: '18', color: BLACK, bgcolor: AMBER }, steps: [{ down: [{ actionId: 'clearpvw', options: {} }], up: [] }], feedbacks: [] }
    p.score = { type: 'button', category: 'Control', name: 'Score + clock display', style: { text: `$(${this.label}:away)-$(${this.label}:home)\nQ$(${this.label}:period) $(${this.label}:clock)\n:$(${this.label}:shot)`, size: '14', color: WHITE, bgcolor: BLACK }, steps: [], feedbacks: [] }

    /* ── modules that need no game feed: Stage Timer, Presenter, Teleprompter ── */
    const L = this.label
    const plain = (category, name, text, actionId, options, feedbacks = [], extra = {}) => ({
      type: 'button', category, name, style: { text, size: '14', color: WHITE, bgcolor: DARK, ...extra },
      steps: [{ down: [{ actionId, options }], up: [] }], feedbacks,
    })
    const lit = (feedbackId, style, options = {}) => ({ feedbackId, options, style })
    p.t_clock = { type: 'button', category: 'Stage Timer', name: 'Time display (press = start / pause)',
      style: { text: `$(${L}:timer)\n$(${L}:timer_name)`, size: '18', color: WHITE, bgcolor: BLACK },
      steps: [{ down: [{ actionId: 'timer', options: { a: 'toggle' } }], up: [] }],
      feedbacks: [lit('timer_color', { bgcolor: GREEN, color: WHITE }, { c: 'green' }), lit('timer_color', { bgcolor: AMBER, color: BLACK }, { c: 'amber' }), lit('timer_color', { bgcolor: RED, color: WHITE }, { c: 'red' })] }
    p.t_toggle = plain('Stage Timer', 'Start / Pause', 'START\nPAUSE', 'timer', { a: 'toggle' }, [lit('timer_running', { bgcolor: GREEN, color: WHITE })], { size: '18' })
    p.t_stop = plain('Stage Timer', 'Stop', 'STOP', 'timer', { a: 'stop' }, [], { size: '18' })
    p.t_restart = plain('Stage Timer', 'Restart', 'RESTART', 'timer', { a: 'restart' })
    p.t_plus = plain('Stage Timer', '+1 minute', '+1 MIN', 'timer', { a: 'plus' }, [], { bgcolor: BLUE })
    p.t_minus = plain('Stage Timer', '-1 minute', '-1 MIN', 'timer', { a: 'minus' }, [], { bgcolor: BLUE })
    p.t_next = plain('Stage Timer', 'Next cue', 'NEXT\nCUE', 'timer', { a: 'next' })
    p.t_prev = plain('Stage Timer', 'Previous cue', 'PREV\nCUE', 'timer', { a: 'prev' })
    for (let n = 1; n <= 8; n++) p[`t_go_${n}`] = plain('Stage Timer', `Go to cue ${n}`, `CUE ${n}\nGO`, 'timer_cue', { n, start: true })

    p.pr_next = plain('Presenter', 'Next slide', 'NEXT ▶', 'presenter', { a: 'next' }, [], { size: '24', bgcolor: AMBER, color: BLACK })
    p.pr_prev = plain('Presenter', 'Previous slide', '◀ BACK', 'presenter', { a: 'prev' }, [], { size: '18' })
    p.pr_blank = plain('Presenter', 'Blank on / off', 'BLANK', 'presenter', { a: 'blank' }, [lit('presenter_blank', { bgcolor: RED, color: WHITE })], { size: '18' })
    p.pr_now = { type: 'button', category: 'Presenter', name: 'On screen now (press = next)',
      style: { text: `$(${L}:slide)\n$(${L}:slide_text)`, size: '14', color: WHITE, bgcolor: BLACK },
      steps: [{ down: [{ actionId: 'presenter', options: { a: 'next' } }], up: [] }], feedbacks: [lit('presenter_blank', { bgcolor: RED, color: WHITE })] }
    p.pr_upnext = { type: 'button', category: 'Presenter', name: 'Next slide (display)',
      style: { text: `NEXT\n$(${L}:slide_next)`, size: '14', color: WHITE, bgcolor: DARK }, steps: [{ down: [], up: [] }], feedbacks: [] }

    p.tp_toggle = plain('Teleprompter', 'Play / Pause', 'PLAY\nPAUSE', 'prompter', { a: 'toggle' }, [lit('prompter_playing', { bgcolor: GREEN, color: WHITE })], { size: '18' })
    p.tp_faster = plain('Teleprompter', 'Faster', 'FASTER\n+10', 'prompter', { a: 'faster' })
    p.tp_slower = plain('Teleprompter', 'Slower', 'SLOWER\n-10', 'prompter', { a: 'slower' })
    p.tp_top = plain('Teleprompter', 'Back to top', 'TOP', 'prompter', { a: 'top' })
    p.tp_back = plain('Teleprompter', 'Jump back', 'BACK', 'prompter', { a: 'back' })
    p.tp_ahead = plain('Teleprompter', 'Jump ahead', 'AHEAD', 'prompter', { a: 'ahead' })
    p.tp_wpm = { type: 'button', category: 'Teleprompter', name: 'Speed display (press = play / pause)',
      style: { text: `$(${L}:prompter_wpm) WPM\n$(${L}:prompter_state)`, size: '14', color: WHITE, bgcolor: BLACK },
      steps: [{ down: [{ actionId: 'prompter', options: { a: 'toggle' } }], up: [] }], feedbacks: [lit('prompter_playing', { bgcolor: GREEN, color: WHITE })] }

    /* ── Take Board ── */
    const tb = (id, name, text, a, feedbacks = [], extra = {}) => { p[id] = plain('Take Board', name, text, 'take_board', { a }, feedbacks, extra) }
    p.tb_slate = { type: 'button', category: 'Take Board', name: 'Slate display (press = CLAP)',
      style: { text: `$(${L}:tb_scene)$(${L}:tb_shot)\nT$(${L}:tb_take)\n$(${L}:tb_roll)`, size: '18', color: WHITE, bgcolor: BLACK },
      steps: [{ down: [{ actionId: 'take_board', options: { a: 'clap' } }], up: [] }], feedbacks: [lit('take_rolling', { bgcolor: RED, color: WHITE })] }
    tb('tb_clap', 'CLAP', 'CLAP', 'clap', [], { size: '24' })
    tb('tb_roll', 'Roll / Cut', 'ROLL\nCUT', 'roll', [lit('take_rolling', { bgcolor: RED, color: WHITE })], { size: '18' })
    tb('tb_good', 'Mark GOOD', 'GOOD', 'good', [lit('take_last', { bgcolor: GREEN, color: WHITE }, { s: 'good' })], { size: '18', bgcolor: GREEN })
    tb('tb_ng', 'Mark NO GOOD', 'NG', 'ng', [lit('take_last', { bgcolor: RED, color: WHITE }, { s: 'ng' })], { size: '24', bgcolor: RED })
    tb('tb_hold', 'Mark HOLD', 'HOLD', 'hold', [lit('take_last', { bgcolor: AMBER, color: BLACK }, { s: 'hold' })], { size: '18', bgcolor: AMBER, color: BLACK })
    tb('tb_next', 'Take +1', 'TAKE\n+1', 'next')
    tb('tb_prev', 'Take -1', 'TAKE\n-1', 'prev')
    tb('tb_shot', 'New shot', 'NEW\nSHOT', 'shot')
    tb('tb_scene', 'New scene', 'NEW\nSCENE', 'scene')
    for (const m of FLOOR_MSGS) p[`tb_msg_${m.replace(/\W+/g, '_').toLowerCase()}`] = { type: 'button', category: 'Take Board', name: `Floor: ${m}`,
      style: { text: m.toUpperCase().replace(' ', '\n'), size: '14', color: WHITE, bgcolor: DARK },
      steps: [{ down: [{ actionId: 'take_board_msg', options: { text: m } }], up: [] }], feedbacks: [lit('take_message', { bgcolor: AMBER, color: BLACK }, { text: m })] }
    p.tb_msg_clear = { type: 'button', category: 'Take Board', name: 'Floor: clear the message', style: { text: 'CLEAR\nMSG', size: '14', color: WHITE, bgcolor: DARK },
      steps: [{ down: [{ actionId: 'take_board_msg', options: { text: '' } }], up: [] }], feedbacks: [] }

    /* ── Intercom (the director's beltpack) ── */
    for (let n = 1; n <= 6; n++) {
      p[`ic_talk_${n}`] = { type: 'button', category: 'Intercom', name: `Talk on channel ${n} (hold)`,
        style: { text: `TALK\n$(${L}:ic_ch${n})`, size: '14', color: WHITE, bgcolor: DARK },
        steps: [{ down: [{ actionId: 'ic_talk', options: { ch: n, mode: 'press' } }], up: [{ actionId: 'ic_talk', options: { ch: n, mode: 'release' } }] }],
        feedbacks: [lit('ic_rx', { bgcolor: GREEN, color: WHITE }, { ch: n }), lit('ic_talking', { bgcolor: RED, color: WHITE }, { ch: n })] }
      p[`ic_listen_${n}`] = plain('Intercom', `Listen to channel ${n}`, `LISTEN\n$(${L}:ic_ch${n})`, 'ic_listen', { ch: n },
        [lit('ic_listening', { bgcolor: BLUE, color: WHITE }, { ch: n }), lit('ic_rx', { bgcolor: GREEN, color: WHITE }, { ch: n })])
    }
    p.ic_latch = plain('Intercom', 'Latch talk', 'LATCH', 'ic_latch', { ch: 0 }, [lit('ic_latched', { bgcolor: AMBER, color: BLACK })], { size: '18' })
    p.ic_mute = plain('Intercom', 'Mute the microphone', 'MUTE', 'ic_mute', {}, [lit('ic_muted', { bgcolor: RED, color: WHITE })], { size: '18' })
    p.ic_call = plain('Intercom', 'Call everyone', 'CALL\nALL', 'ic_call', {}, [], { size: '18' })
    p.ic_status = { type: 'button', category: 'Intercom', name: 'Status display',
      style: { text: `$(${L}:ic_state)\n$(${L}:ic_talk)`, size: '14', color: WHITE, bgcolor: BLACK }, steps: [{ down: [], up: [] }],
      feedbacks: [lit('ic_muted', { bgcolor: DARK, color: WHITE }), lit('ic_talking', { bgcolor: RED, color: WHITE }, { ch: 0 })] }

    const nums = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean)
    for (const side of ['home', 'away']) {
      const abbr = side === 'home' ? this.config.homeAbbr || 'HOME' : this.config.awayAbbr || 'AWAY'
      for (const n of nums(side === 'home' ? this.config.homeNums : this.config.awayNums)) {
        const cat = `${abbr} players`
        p[`${side}_${n}_3pt`] = btn(cat, `#${n} 3PT`, `#${n}\n3PT`, 'play', { kind: '3pt', team: side, num: n }, 'play_on', { kind: '3pt', num: n })
        p[`${side}_${n}_2pt`] = btn(cat, `#${n} +2`, `#${n}\n+2`, 'play', { kind: '2pt', team: side, num: n }, 'play_on', { kind: '2pt', num: n })
        p[`${side}_${n}_ft`] = btn(cat, `#${n} +1 FT`, `#${n}\n+1 FT`, 'play', { kind: 'ft', team: side, num: n }, 'play_on', { kind: 'ft', num: n })
        p[`${side}_${n}_lower`] = btn(cat, `#${n} Lower third`, `#${n}\nL3`, 'lower', { team: side, num: n, bus: 'program' })
        p[`${side}_${n}_atl`] = btn(cat, `#${n} At The Line`, `#${n}\nAT LINE`, 'atl', { team: side, num: n, bus: 'program' })
      }
    }

    /* ── dress the keys (Broadcast skin) ── */
    if (skinOn) {
      const dress = (id, img, opts) => { if (p[id]) p[id] = skin(p[id], img, opts) }
      for (const g of GRAPHICS) dress(`g_${g.id}`, `g_${g.id}`)
      for (const f of FULLS) dress(`f_${f.id}`, `f_${f.id}`)
      // team flags: the image carries the flag, Companion writes the team on top
      for (const s of SIDES) for (const t of FLAG_TITLES) {
        const abbr = s.id === 'home' ? this.config.homeAbbr || 'HOME' : this.config.awayAbbr || 'AWAY'
        dress(`flag_${s.id}_${t.id}`, `flag_${t.id}`, { keepText: true, style: { text: abbr, size: '14', alignment: 'center:top' } })
      }
      dress('take', 'take'); dress('clear', 'clear'); dress('clearpvw', 'clearpvw')
      dress('score', 'score', { keepText: true })
      dress('t_clock', 't_clock', { keepText: true, lit: ['t_clock__green', 't_clock__amber', 't_clock__red'] })
      for (const id of ['t_toggle', 't_stop', 't_restart', 't_plus', 't_minus', 't_next', 't_prev', 'pr_next', 'pr_prev', 'pr_blank', 'tp_toggle', 'tp_faster', 'tp_slower', 'tp_top', 'tp_back', 'tp_ahead']) dress(id, id)
      for (let n = 1; n <= 8; n++) dress(`t_go_${n}`, `t_go_${n}`)
      dress('pr_now', 'pr_now', { keepText: true, style: { text: `$(${L}:slide)\n$(${L}:slide_text)`, alignment: 'center:center' } })
      dress('pr_upnext', 'pr_upnext', { keepText: true, style: { text: `$(${L}:slide_next)` } })
      dress('tp_wpm', 'tp_wpm', { keepText: true })
      dress('tb_slate', 'tb_slate', { keepText: true })
      for (const id of ['tb_clap', 'tb_roll', 'tb_good', 'tb_ng', 'tb_hold', 'tb_next', 'tb_prev', 'tb_shot', 'tb_scene', 'tb_msg_clear']) dress(id, id)
      for (const m of FLOOR_MSGS) { const id = `tb_msg_${m.replace(/\W+/g, '_').toLowerCase()}`; dress(id, id) }
      // intercom: the image carries the action, Companion writes the channel's name along the top
      for (let n = 1; n <= 6; n++) {
        dress(`ic_talk_${n}`, 'ic_talk', { keepText: true, lit: ['ic_talk__rx', 'ic_talk__on'], style: { text: `$(${L}:ic_ch${n})`, size: '14', alignment: 'center:top' } })
        dress(`ic_listen_${n}`, 'ic_listen', { keepText: true, lit: ['ic_listen__on', 'ic_listen__rx'], style: { text: `$(${L}:ic_ch${n})`, size: '14', alignment: 'center:top' } })
      }
      for (const id of ['ic_latch', 'ic_mute', 'ic_call']) dress(id, id)
      dress('ic_status', 'ic_status', { keepText: true, lit: ['ic_status__muted', 'ic_status__on'], style: { text: `$(${L}:ic_state)\n$(${L}:ic_talk)`, alignment: 'center:center' } })
      // players: the play is on the image, Companion writes the jersey number
      for (const side of ['home', 'away']) for (const n of nums(side === 'home' ? this.config.homeNums : this.config.awayNums)) {
        for (const kind of ['3pt', '2pt', 'ft', 'lower', 'atl']) dress(`${side}_${n}_${kind}`, `pl_${side}_${kind}`, { keepText: true, style: { text: `#${n}`, size: '24', alignment: 'center:center' } })
      }
    }
    return p
  }
}

runEntrypoint(ProLogicInstance, [])
