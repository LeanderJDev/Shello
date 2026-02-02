export type VerticalOffset = -1 | 0 | 1;

export interface PartConfig {
  char: string; // the character(s) to render for this part
  y?: VerticalOffset; // vertical offset: -1 (down), 0 (middle), 1 (up)
}

export interface FaceConfig {
  leftArm: PartConfig;
  rightArm: PartConfig;
  leftEye: string;
  rightEye: string;
  mouth: string;
}

export enum EmotionKey {
  Neutral = 'neutral',
  Happy = 'happy',
  Sad = 'sad',
  Surprised = 'surprised',
  Angry = 'angry',
  Crazy = 'crazy',
  TPose = 'tpose',
}

export const EMOTIONS: Record<EmotionKey, FaceConfig> = {
  [EmotionKey.Neutral]: {
    leftArm: { char: '<', y: 1 },
    rightArm: { char: '>', y: -1 },
    leftEye: '^',
    rightEye: '^',
    mouth: '\u00A0',
  },
  [EmotionKey.Happy]: {
    leftArm: { char: '<', y: 1 },
    rightArm: { char: '>', y: 1 },
    leftEye: '^',
    rightEye: '^',
    mouth: '~',
  },
  [EmotionKey.Sad]: {
    leftArm: { char: '/', y: 0 },
    rightArm: { char: '\\', y: 0 },
    leftEye: 'v',
    rightEye: 'v',
    mouth: '_',
  },
  [EmotionKey.Surprised]: {
    leftArm: { char: '\\', y: 1 },
    rightArm: { char: '/', y: 1 },
    leftEye: '°',
    rightEye: '°',
    mouth: 'o',
  },
  [EmotionKey.Angry]: {
    leftArm: { char: '<', y: 0 },
    rightArm: { char: '>', y: 0 },
    leftEye: '`',
    rightEye: '´',
    mouth: '∧',
  },
  [EmotionKey.Crazy]: {
    leftArm: { char: '~', y: 0 },
    rightArm: { char: '~', y: 0 },
    leftEye: 'o',
    rightEye: 'o',
    mouth: '-',
  },
  [EmotionKey.TPose]: {
    leftArm: { char: '-', y: 0 },
    rightArm: { char: '-', y: 0 },
    leftEye: '⁻',
    rightEye: '⁻',
    mouth: '-',
  },
};

export const DEFAULT_FACE: FaceConfig = EMOTIONS[EmotionKey.Neutral];
