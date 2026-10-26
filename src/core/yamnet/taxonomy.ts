import { YAMNET_NUM_CLASSES } from './constants';
import { YAMNET_LABELS } from './labels';

/** Bump when any mapping below changes. */
export const TAXONOMY_VERSION = 2;

/**
 * Broad visual families. The artwork and the icons work at this level; there is no animation or
 * icon per YAMNet class. A family says nothing about where a sound comes from or how many sources
 * there are.
 */
export const VISUAL_FAMILIES = [
  'voice',
  'people',
  'music',
  'animals',
  'nature',
  'vehicles',
  'household',
  'machines',
  'signals',
  'impacts',
  'other',
] as const;

export type VisualFamily = (typeof VISUAL_FAMILIES)[number];

export const FAMILY_DISPLAY: Record<VisualFamily, string> = {
  voice: 'Voices',
  people: 'People',
  music: 'Music',
  animals: 'Animals',
  nature: 'Nature and water',
  vehicles: 'Vehicles and traffic',
  household: 'Home and objects',
  machines: 'Machines and tools',
  signals: 'Bells and signals',
  impacts: 'Impacts',
  other: 'Other sounds',
};

/**
 * `sound`: may be shown as a recognized sound. `context`: describes the room, the recording or
 * unspecified background (e.g. "Inside, small room", "Echo", "Field recording"); it is a valid
 * model output but never shown or logged as a sound. `silence`: the explicit quiet state.
 */
export type ClassRole = 'sound' | 'context' | 'silence';

export interface TaxonomyEntry {
  /** YAMNet output index. */
  index: number;
  /** Exact pinned label at that index (src/core/yamnet/labels.ts). */
  label: string;
  /** Short, plain English name shown in the app. */
  display: string;
  family: VisualFamily;
  /**
   * Finer subtype: classes that describe the same kind of source (e.g. Dog, Bark, Howl). They are
   * tracked and shown as one sound, so a parent and its child are never presented as two sources.
   */
  group: string;
  /** A generic parent ("Animal", "Vehicle") that gives way to any specific sound of its family. */
  umbrella: boolean;
  role: ClassRole;
}

/** Raw labels, or inclusive `[first, last]` spans in model order. */
type Members = ReadonlyArray<string | readonly [string, string]>;

interface GroupSpec {
  group: string;
  family: VisualFamily;
  members: Members;
  umbrella?: boolean;
  role?: ClassRole;
}

const g = (group: string, family: VisualFamily, members: Members, extra: Partial<GroupSpec> = {}): GroupSpec => ({
  group,
  family,
  members,
  ...extra,
});

/**
 * Every YAMNet class, exactly once (checked by tests). Order and spans follow the model's label
 * order; a span is resolved against the pinned labels, so any drift fails the build's tests.
 */
const GROUPS: readonly GroupSpec[] = [
  // Voices
  g('speech', 'voice', [['Speech', 'Speech synthesizer']]),
  g('shouting', 'voice', [['Shout', 'Children shouting']]),
  g('screaming', 'voice', ['Screaming']),
  g('whispering', 'voice', ['Whispering']),
  g('laughter', 'voice', [['Laughter', 'Chuckle, chortle']]),
  g('crying', 'voice', [['Crying, sobbing', 'Wail, moan']]),
  g('sigh', 'voice', ['Sigh']),
  g('groan', 'voice', [['Groan', 'Grunt']]),
  g('whistling', 'voice', ['Whistling']),
  g('crowd', 'voice', [['Chatter', 'Children playing']]),

  // People: body, movement, hands
  g('breathing', 'people', [['Breathing', 'Snort']]),
  g('cough', 'people', [['Cough', 'Throat clearing']]),
  g('sneeze', 'people', [['Sneeze', 'Sniff']]),
  g('footsteps', 'people', [['Run', 'Walk, footsteps']]),
  g('eating', 'people', [['Chewing, mastication', 'Biting']]),
  g('gargling', 'people', ['Gargling']),
  g('body', 'people', [['Stomach rumble', 'Fart']]),
  g('hands', 'people', ['Hands'], { umbrella: true }),
  g('finger_snap', 'people', ['Finger snapping']),
  g('applause', 'people', ['Clapping', 'Cheering', 'Applause']),
  g('heartbeat', 'people', [['Heart sounds, heartbeat', 'Heart murmur']]),

  // Animals
  g('animal', 'animals', ['Animal', 'Domestic animals, pets', 'Wild animals'], { umbrella: true }),
  g('dog', 'animals', [['Dog', 'Whimper (dog)'], 'Canidae, dogs, wolves']),
  g('cat', 'animals', [['Cat', 'Caterwaul']]),
  g('farm', 'animals', [['Livestock, farm animals, working animals', 'Moo'], ['Pig', 'Sheep']]),
  g('poultry', 'animals', [['Fowl', 'Honk']]),
  g('big_cat', 'animals', [['Roaring cats (lions, tigers)', 'Roar']]),
  g('bird', 'animals', [['Bird', 'Bird flight, flapping wings']]),
  g('rodent', 'animals', [['Rodents, rats, mice', 'Patter']]),
  g('insect', 'animals', [['Insect', 'Bee, wasp, etc.']]),
  g('frog', 'animals', [['Frog', 'Croak']]),
  g('snake', 'animals', [['Snake', 'Rattle']]),
  g('whale', 'animals', ['Whale vocalization']),

  // Music, including singing and every instrument, genre and style: one source.
  g('music', 'music', [
    ['Singing', 'Humming'],
    ['Music', 'Harp'],
    ['Harmonica', 'Scratching (performance technique)'],
    ['Pop music', 'Scary music'],
  ]),

  // Nature, weather and water
  g('wind', 'nature', [['Wind', 'Wind noise (microphone)']]),
  g('thunder', 'nature', [['Thunderstorm', 'Thunder']]),
  g('water', 'nature', ['Water', ['Stream', 'Gurgling']]),
  g('rain', 'nature', [['Rain', 'Rain on surface']]),
  g('fire', 'nature', [['Fire', 'Crackle']]),
  g('liquid', 'nature', [['Liquid', 'Boiling'], 'Plop']),

  // Vehicles and traffic
  g('vehicle', 'vehicles', ['Vehicle', 'Motor vehicle (road)'], { umbrella: true }),
  g('boat', 'vehicles', [['Boat, Water vehicle', 'Ship']]),
  g('car', 'vehicles', ['Car', ['Power windows, electric windows', 'Race car, auto racing']]),
  g('truck', 'vehicles', [['Truck', 'Air brake'], 'Ice cream truck, ice cream van']),
  g('bus', 'vehicles', ['Bus']),
  g('motorcycle', 'vehicles', ['Motorcycle']),
  g('traffic', 'vehicles', ['Traffic noise, roadway noise']),
  g('train', 'vehicles', [['Rail transport', 'Subway, metro, underground']]),
  g('aircraft', 'vehicles', [['Aircraft', 'Fixed-wing aircraft, airplane']]),
  g('bicycle', 'vehicles', ['Bicycle']),
  g('skateboard', 'vehicles', ['Skateboard']),
  g('engine', 'vehicles', [['Engine', 'Light engine (high frequency)'], ['Medium engine (mid frequency)', 'Accelerating, revving, vroom']]),

  // Machines and tools
  g('drill', 'machines', ["Dental drill, dentist's drill", 'Drill']),
  g('lawn_mower', 'machines', ['Lawn mower']),
  g('chainsaw', 'machines', ['Chainsaw']),
  g('kitchen_appliance', 'machines', [['Microwave oven', 'Blender']]),
  g('hair_dryer', 'machines', ['Hair dryer']),
  g('electric_toothbrush', 'machines', ['Electric toothbrush']),
  g('vacuum', 'machines', ['Vacuum cleaner']),
  g('shaver', 'machines', ['Electric shaver, electric razor']),
  g('mechanisms', 'machines', ['Mechanisms'], { umbrella: true }),
  g('gears', 'machines', ['Ratchet, pawl', ['Gears', 'Pulleys']]),
  g('clock', 'machines', [['Clock', 'Tick-tock']]),
  g('sewing_machine', 'machines', ['Sewing machine']),
  g('fan', 'machines', [['Mechanical fan', 'Air conditioning']]),
  g('cash_register', 'machines', ['Cash register']),
  g('printer', 'machines', ['Printer']),
  g('camera', 'machines', [['Camera', 'Single-lens reflex camera']]),
  g('tools', 'machines', ['Tools'], { umbrella: true }),
  g('hammer', 'machines', ['Hammer']),
  g('jackhammer', 'machines', ['Jackhammer']),
  g('sawing', 'machines', [['Sawing', 'Sanding']]),
  g('power_tool', 'machines', ['Power tool']),
  g('hum', 'machines', ['Whir', 'Hum', 'Mains hum']),

  // Home and objects
  g('door', 'household', ['Door', ['Sliding door', 'Drawer open or close']]),
  g('dishes', 'household', [['Dishes, pots, and pans', 'Cutlery, silverware']]),
  g('cooking', 'household', [['Chopping (food)', 'Frying (food)'], 'Sizzle']),
  g('tap', 'household', [['Water tap, faucet', 'Bathtub (filling or washing)']]),
  g('toilet', 'household', ['Toilet flush']),
  g('toothbrush', 'household', ['Toothbrush']),
  g('zipper', 'household', ['Zipper (clothing)']),
  g('keys', 'household', ['Keys jangling']),
  g('coin', 'household', ['Coin (dropping)']),
  g('scissors', 'household', ['Scissors']),
  g('cards', 'household', ['Shuffling cards']),
  g('typing', 'household', [['Typing', 'Computer keyboard']]),
  g('writing', 'household', ['Writing']),
  g('scraping', 'household', [['Scratch', 'Rub']]),
  g('rolling', 'household', ['Roll']),
  g('crumpling', 'household', [['Crushing', 'Crumpling, crinkling']]),
  g('tearing', 'household', ['Tearing']),
  g('creak', 'household', [['Squeal', 'Creak']]),
  g('rustle', 'household', ['Rustle']),
  g('clicking', 'household', [['Clicking', 'Clickety-clack']]),
  g('crunch', 'household', ['Crunch']),

  // Bells and signals
  g('bell', 'signals', ['Cowbell', ['Bell', 'Change ringing (campanology)'], 'Jingle, tinkle']),
  g('horn', 'signals', [['Vehicle horn, car horn, honking', 'Toot'], 'Air horn, truck horn', 'Foghorn']),
  g('alarm', 'signals', ['Car alarm', 'Alarm', 'Alarm clock', ['Smoke detector, smoke alarm', 'Fire alarm']]),
  g('siren', 'signals', [['Emergency vehicle', 'Fire engine, fire truck (siren)'], ['Siren', 'Civil defense siren']]),
  g('doorbell', 'signals', [['Doorbell', 'Ding-dong']]),
  g('phone', 'signals', [['Telephone', 'Busy signal']]),
  g('buzzer', 'signals', ['Buzzer']),
  g('whistle', 'signals', [['Whistle', 'Steam whistle']]),
  g('beep', 'signals', ['Reversing beeps', ['Beep, bleep', 'Ding']]),

  // Impacts
  g('bang', 'impacts', [['Explosion', 'Artillery fire'], ['Eruption', 'Boom']]),
  g('pop', 'impacts', [['Cap gun', 'Burst, pop']]),
  g('wood', 'impacts', [['Wood', 'Crack']]),
  g('glass', 'impacts', [['Glass', 'Shatter']]),
  g('whoosh', 'impacts', [['Arrow', 'Whoosh, swoosh, swish']]),
  g('thump', 'impacts', [['Thump, thud', 'Thunk'], 'Bang']),
  g('slap', 'impacts', [['Slap, smack', 'Whack, thwack'], 'Whip']),
  g('crash', 'impacts', [['Smash, crash', 'Breaking']]),
  g('bounce', 'impacts', ['Basketball bounce', 'Bouncing']),
  g('flap', 'impacts', ['Flap']),
  g('clang', 'impacts', ['Clang', 'Clatter']),

  // Other sounds
  g('tone', 'other', ['Sonar', 'Electronic tuner', ['Sine wave', 'Chirp tone'], 'Pulse']),
  g('effect', 'other', [['Effects unit', 'Chorus effect'], 'Sound effect', ['Zing', 'Boing']]),
  g('noise', 'other', ['Static', 'Distortion', ['Cacophony', 'Pink noise']]),
  g('vibration', 'other', [['Throbbing', 'Vibration']]),
  g('rumble', 'other', ['Rumble']),
  g('media', 'other', [['Television', 'Radio']]),

  // Not shown as sounds: the room, the recording, unspecified background.
  g('context', 'other', [['Inside, small room', 'Environmental noise'], 'Sidetone', 'Field recording'], { role: 'context' }),
  g('silence', 'other', ['Silence'], { role: 'silence' }),
];

/**
 * Display names that differ from the plain default (the raw label up to its first comma, without
 * a parenthetical). Besides wording, these are the deliberate fallbacks: a classifier score is not
 * evidence for a weapon, a specific emergency service, a medical condition, a religion or a region,
 * so those classes are shown with a neutral description of the sound instead (docs/model.md).
 */
const DISPLAY: Readonly<Record<string, string>> = {
  'Speech synthesizer': 'Synthetic voice',
  Shout: 'Shouting',
  Bellow: 'Shouting',
  Yell: 'Shouting',
  'Baby cry, infant cry': 'Baby crying',
  'Hubbub, speech noise, speech babble': 'Crowd murmur',
  Mantra: 'Chant',
  'A capella': 'A cappella',
  Wheeze: 'Wheezing',
  Pant: 'Panting',
  Run: 'Running footsteps',
  Shuffle: 'Shuffling feet',
  'Walk, footsteps': 'Footsteps',
  'Burping, eructation': 'Burp',
  Fart: 'Body sound',
  Hands: 'Hand sounds',
  'Heart sounds, heartbeat': 'Heartbeat',
  'Heart murmur': 'Heartbeat',
  'Domestic animals, pets': 'Pet',
  'Wild animals': 'Wild animal',
  Bark: 'Dog barking',
  Yip: 'Dog barking',
  'Bow-wow': 'Dog barking',
  Howl: 'Howling',
  'Whimper (dog)': 'Dog whimpering',
  'Canidae, dogs, wolves': 'Dog or wolf',
  Purr: 'Purring',
  Hiss: 'Hissing',
  Caterwaul: 'Cat yowling',
  'Livestock, farm animals, working animals': 'Farm animals',
  'Clip-clop': 'Hoofbeats',
  Fowl: 'Poultry',
  Cluck: 'Clucking',
  'Crowing, cock-a-doodle-doo': 'Rooster crowing',
  Honk: 'Goose honk',
  'Roaring cats (lions, tigers)': 'Roar',
  'Bird vocalization, bird call, bird song': 'Birdsong',
  'Chirp, tweet': 'Bird chirping',
  Coo: 'Cooing',
  Caw: 'Crow cawing',
  Hoot: 'Owl hooting',
  'Bird flight, flapping wings': 'Wing flaps',
  'Rodents, rats, mice': 'Rodent',
  Cricket: 'Crickets',
  Buzz: 'Buzzing',
  'Bee, wasp, etc.': 'Bee or wasp',
  Croak: 'Croaking',
  Snake: 'Hissing',
  Rattle: 'Rattling',
  'Whale vocalization': 'Whale song',
  'Tapping (guitar technique)': 'Guitar tapping',
  'Keyboard (musical)': 'Keyboard instrument',
  'Plucked string instrument': 'String instrument',
  'Bowed string instrument': 'String instrument',
  Shofar: 'Horn instrument',
  'Scratching (performance technique)': 'DJ scratching',
  'Rhythm and blues': 'R&B',
  'Middle Eastern music': 'Music',
  'Music of Latin America': 'Music',
  'Music of Africa': 'Music',
  'Christian music': 'Music',
  'Gospel music': 'Music',
  'Music of Asia': 'Music',
  'Carnatic music': 'Music',
  'Music of Bollywood': 'Music',
  'Traditional music': 'Music',
  'Independent music': 'Indie music',
  'Christmas music': 'Music',
  'Wedding music': 'Music',
  'Happy music': 'Music',
  'Sad music': 'Music',
  'Tender music': 'Music',
  'Exciting music': 'Music',
  'Angry music': 'Music',
  'Scary music': 'Music',
  'Music for children': "Children's music",
  'Jingle bell': 'Jingle bells',
  'Change ringing (campanology)': 'Church bells',
  'Jingle, tinkle': 'Tinkling',
  'Wind noise (microphone)': 'Wind',
  Raindrop: 'Raindrops',
  'Rain on surface': 'Rain',
  Crackle: 'Crackling',
  'Fill (with liquid)': 'Filling',
  'Pump (liquid)': 'Pumping',
  Stir: 'Stirring',
  'Rowboat, canoe, kayak': 'Rowing',
  'Motor vehicle (road)': 'Road vehicle',
  'Power windows, electric windows': 'Car window',
  'Car passing by': 'Car passing',
  'Railroad car, train wagon': 'Train',
  'Rail transport': 'Train',
  'Traffic noise, roadway noise': 'Traffic',
  'Fixed-wing aircraft, airplane': 'Airplane',
  'Light engine (high frequency)': 'Small engine',
  'Medium engine (mid frequency)': 'Engine',
  Idling: 'Engine idling',
  'Accelerating, revving, vroom': 'Engine revving',
  "Dental drill, dentist's drill": 'Drill',
  'Microwave oven': 'Microwave',
  'Mechanical fan': 'Fan',
  'Single-lens reflex camera': 'Camera shutter',
  Mechanisms: 'Mechanism',
  Tick: 'Ticking',
  'Tick-tock': 'Clock ticking',
  Whir: 'Whirring',
  'Mains hum': 'Electrical hum',
  Slam: 'Door slam',
  Tap: 'Tapping',
  'Cupboard open or close': 'Cupboard',
  'Drawer open or close': 'Drawer',
  'Water tap, faucet': 'Running tap',
  'Coin (dropping)': 'Coin dropping',
  'Computer keyboard': 'Keyboard typing',
  Scratch: 'Scratching',
  Scrape: 'Scraping',
  Rub: 'Rubbing',
  Roll: 'Rolling',
  Creak: 'Creaking',
  Rustle: 'Rustling',
  'Vehicle horn, car horn, honking': 'Car horn',
  Toot: 'Horn',
  'Car alarm': 'Alarm',
  'Smoke detector, smoke alarm': 'Alarm',
  'Fire alarm': 'Alarm',
  'Emergency vehicle': 'Siren',
  'Police car (siren)': 'Siren',
  'Ambulance (siren)': 'Siren',
  'Fire engine, fire truck (siren)': 'Siren',
  'Civil defense siren': 'Siren',
  'Ding-dong': 'Doorbell',
  Telephone: 'Phone',
  'Telephone bell ringing': 'Phone ringing',
  'Telephone dialing, DTMF': 'Phone dialing',
  'Reversing beeps': 'Beeping',
  Explosion: 'Loud bang',
  'Gunshot, gunfire': 'Loud bang',
  'Machine gun': 'Rapid bangs',
  Fusillade: 'Rapid bangs',
  'Artillery fire': 'Loud bang',
  Eruption: 'Loud rumble',
  'Cap gun': 'Pop',
  'Burst, pop': 'Pop',
  Wood: 'Wood knock',
  Chop: 'Chopping wood',
  Splinter: 'Splintering',
  'Chink, clink': 'Clink',
  Shatter: 'Shattering',
  Arrow: 'Whoosh',
  'Basketball bounce': 'Ball bouncing',
  'Smash, crash': 'Crash',
  Flap: 'Flapping',
  Sonar: 'Sonar ping',
  'Electronic tuner': 'Tuner tone',
  'Effects unit': 'Audio effect',
  'Chorus effect': 'Audio effect',
  'Sine wave': 'Pure tone',
  Harmonic: 'Harmonic tone',
  'Chirp tone': 'Tone sweep',
  Pulse: 'Pulsing tone',
  Television: 'TV',
  'Inside, small room': 'Room sound',
  'Inside, large room or hall': 'Room sound',
  'Inside, public space': 'Room sound',
  'Outside, urban or manmade': 'Outdoor sound',
  'Outside, rural or natural': 'Outdoor sound',
  'Environmental noise': 'Background noise',
  Noise: 'Background noise',
  Silence: 'Quiet',
};

/** The raw label up to its first comma, without a parenthetical: "Fly, housefly" -> "Fly". */
export function defaultDisplay(label: string): string {
  return label.split(',')[0]!.replace(/\s*\([^)]*\)/g, '').trim();
}

function indexOfLabel(label: string): number {
  const index = YAMNET_LABELS.indexOf(label);
  if (index < 0) throw new Error(`Taxonomy names an unknown YAMNet label: ${label}`);
  return index;
}

function expand(members: Members): number[] {
  return members.flatMap((m) => {
    if (typeof m === 'string') return [indexOfLabel(m)];
    const [from, to] = [indexOfLabel(m[0]), indexOfLabel(m[1])];
    if (to < from) throw new Error(`Taxonomy span is reversed: ${m[0]} .. ${m[1]}`);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  });
}

function build(): readonly TaxonomyEntry[] {
  const entries: (TaxonomyEntry | undefined)[] = new Array(YAMNET_NUM_CLASSES);
  for (const spec of GROUPS) {
    for (const index of expand(spec.members)) {
      if (entries[index]) throw new Error(`Taxonomy maps class ${index} twice`);
      const label = YAMNET_LABELS[index]!;
      entries[index] = {
        index,
        label,
        display: DISPLAY[label] ?? defaultDisplay(label),
        family: spec.family,
        group: spec.group,
        umbrella: spec.umbrella ?? false,
        role: spec.role ?? 'sound',
      };
    }
  }
  const missing = entries.findIndex((e) => e === undefined);
  if (missing >= 0 || entries.length !== YAMNET_NUM_CLASSES) throw new Error(`Taxonomy misses class ${missing}`);
  return entries as TaxonomyEntry[];
}

/**
 * The single, versioned mapping for every YAMNet output, on every platform: `TAXONOMY[i]`
 * describes model output `i`. Exhaustive, and validated against the pinned labels by tests.
 */
export const TAXONOMY: readonly TaxonomyEntry[] = build();

export const SILENCE_INDEX = 494; // "Silence"

/** Order of groups as declared; a stable tie-break wherever two sounds score the same. */
export const GROUP_ORDER: ReadonlyMap<string, number> = new Map(GROUPS.map((s, i) => [s.group, i]));

/** Taxonomy entry for a model output index, or `undefined` outside 0..520. */
export function classInfo(index: number): TaxonomyEntry | undefined {
  return TAXONOMY[index];
}

/** Text for the states that are not a recognized sound. */
export const STATE_DISPLAY = {
  silence: 'Quiet',
  unknown: 'No confident sound',
} as const;
