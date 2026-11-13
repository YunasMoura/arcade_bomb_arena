export const state = {
  connection: 'connecting',
  screen: 'menu',
  profile: null,
  selectedCharacter: 'rex',
  inMatchmaking: false,
  room: null,
  clockOffset: 0,
  rtt: null,
};

export function serverNow() {
  return Date.now() + state.clockOffset;
}
