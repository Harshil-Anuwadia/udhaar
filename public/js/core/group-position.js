// A group can have balances in both directions; zero net does not mean settled.
export function groupPosition(members) {
  const incoming = members.reduce((sum, member) => sum + (Number(member.owes) || 0), 0);
  const outgoing = members.reduce((sum, member) => sum + (Number(member.isOwed) || 0), 0);
  const state = incoming && outgoing ? 'both' : incoming ? 'incoming' : outgoing ? 'outgoing' : 'settled';
  return { incoming, outgoing, state };
}
