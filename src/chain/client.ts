import { GENESIS, NETWORK, IS_MAINNET, MAINNET_MINTS, RPC_URL } from './network';
import { UserFacingError } from '../services/errors';
import { BN, utils } from '@coral-xyz/anchor';
import { Buffer } from 'buffer';
import {
  Connection,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  type AccountInfo,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  AccountLayout,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { type CreateInput, type Member, type Round, validateRules } from '../domain/round';
import {
  coder,
  createInstruction,
  contributeInstruction,
  DEFAULT_PROGRAM_ID,
  joinInstructions,
  memberAddresses,
  roundAddress,
  ROUND_IDL,
  withdrawInstructions,
  type ChainConfig,
} from './instructions';

export { RPC_URL } from './network';
export function configuredClient(): RoundClient | null {
  const program = process.env.EXPO_PUBLIC_ROUND_PROGRAM_ID;
  const savings = process.env.EXPO_PUBLIC_USDC_MINT;
  const bond = process.env.EXPO_PUBLIC_SKR_MINT;
  if (!program || !savings || !bond) return null;
  try {
    return new RoundClient(new Connection(RPC_URL, 'confirmed'), {
      programId: new PublicKey(program),
      savingsMint: new PublicKey(IS_MAINNET ? MAINNET_MINTS.savings : savings),
      bondMint: new PublicKey(IS_MAINNET ? MAINNET_MINTS.bond : bond),
    });
  } catch {
    return null;
  }
}

type WireRound = {
  creator: PublicKey;
  nonce: BN;
  name: string;
  savings_mint: PublicKey;
  bond_mint: PublicKey;
  amount: BN;
  bond_amount: BN;
  period_seconds: BN;
  periods: number;
  starts_at: BN;
  ends_at: BN;
  max_members: number;
};
type WireMember = {
  round: PublicKey;
  owner: PublicKey;
  deposited: BN;
  bond_deposited: BN;
  paid_mask: BN;
  withdrawn: boolean;
};
export type WalletBalances = { sol: number; savings: number; bond: number };
export type Submit = (instructions: TransactionInstruction[], label: string) => Promise<string>;
export const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

function number(value: BN): number {
  const n = Number(value.toString());
  if (!Number.isSafeInteger(n)) throw new Error('This amount exceeds the supported display range.');
  return n;
}
function filter(name: string) {
  const account = ROUND_IDL.accounts?.find((account) => account.name === name);
  if (!account) throw new Error('Account is missing from the generated interface.');
  return {
    memcmp: { offset: 0, bytes: utils.bytes.bs58.encode(Buffer.from(account.discriminator)) },
  };
}

export class RoundClient {
  constructor(
    readonly connection: Connection,
    readonly config: ChainConfig,
    private readonly expectedGenesis = GENESIS[NETWORK],
  ) {}

  async verifyDeployment() {
    if (
      this.expectedGenesis === GENESIS['mainnet-beta'] &&
      (this.config.savingsMint.toBase58() !== MAINNET_MINTS.savings ||
        this.config.bondMint.toBase58() !== MAINNET_MINTS.bond)
    )
      throw new UserFacingError(
        'Mainnet requires official USDC and SKR. Transactions are disabled.',
      );
    if (!this.config.programId.equals(DEFAULT_PROGRAM_ID))
      throw new Error('The configured program does not match this app build.');
    const [genesis, program] = await Promise.all([
      this.connection.getGenesisHash(),
      this.connection.getAccountInfo(this.config.programId),
    ]);
    if (genesis !== this.expectedGenesis)
      throw new UserFacingError(
        'The connection does not match the configured network. Transactions are disabled.',
      );
    if (!program?.executable)
      throw new UserFacingError(
        'ROUND is not deployed on this network yet. Transactions are unavailable.',
      );
    const [savings, bond] = await Promise.all([
      getMint(this.connection, this.config.savingsMint),
      getMint(this.connection, this.config.bondMint),
    ]).catch(() => {
      throw new UserFacingError(
        'Unable to verify the savings tokens. Refresh before making a payment.',
      );
    });
    if (
      savings.decimals !== 6 ||
      bond.decimals !== 6 ||
      this.config.savingsMint.equals(this.config.bondMint)
    )
      throw new UserFacingError(
        'The configured savings tokens are not supported. Transactions are disabled.',
      );
  }

  async chainTime() {
    const clock = await this.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY, 'confirmed');
    if (!clock || clock.data.length < 40) throw new Error('Unable to read the network clock.');
    return Number(clock.data.readBigInt64LE(32));
  }

  async balances(owner: PublicKey): Promise<WalletBalances> {
    const keys = [
      owner,
      getAssociatedTokenAddressSync(this.config.savingsMint, owner),
      getAssociatedTokenAddressSync(this.config.bondMint, owner),
    ];
    const accounts = await this.connection.getMultipleAccountsInfo(keys, 'confirmed');
    const tokenAmount = (account: AccountInfo<Buffer> | null) => {
      if (!account) return 0;
      if (!account.owner.equals(TOKEN_PROGRAM_ID))
        throw new Error('Unexpected wallet token account.');
      const value = Number(AccountLayout.decode(account.data).amount);
      if (!Number.isSafeInteger(value))
        throw new Error('Wallet token balance is too large to display safely.');
      return value;
    };
    return {
      sol: (accounts[0]?.lamports ?? 0) / 1_000_000_000,
      savings: tokenAmount(accounts[1]),
      bond: tokenAmount(accounts[2]),
    };
  }

  private decodeRound(id: PublicKey, account: AccountInfo<Buffer>): WireRound {
    if (!account.owner.equals(this.config.programId))
      throw new UserFacingError('This invitation does not belong to ROUND.');
    const r = coder.accounts.decode<WireRound>('SavingsRound', account.data);
    if (
      !r.savings_mint.equals(this.config.savingsMint) ||
      !r.bond_mint.equals(this.config.bondMint)
    )
      throw new UserFacingError('This ROUND uses unrecognized tokens. Joining is disabled.');
    if (!roundAddress(r.creator, BigInt(r.nonce.toString()), this.config.programId).equals(id))
      throw new Error('Invalid ROUND address.');
    return r;
  }

  async fetchRound(id: string, viewer: string): Promise<Round> {
    const key = new PublicKey(id);
    const account = await this.connection.getAccountInfo(key, 'confirmed');
    if (!account)
      throw new UserFacingError('This ROUND was not found on this network. Check the invitation.');
    const r = this.decodeRound(key, account);
    const records = await this.connection.getProgramAccounts(this.config.programId, {
      commitment: 'confirmed',
      filters: [filter('Member'), { memcmp: { offset: 8, bytes: id } }],
    });
    const members: Member[] = records
      .map(({ pubkey, account }) => {
        const member = coder.accounts.decode<WireMember>('Member', account.data);
        if (
          !member.round.equals(key) ||
          !memberAddresses(key, member.owner, this.config.programId).member.equals(pubkey)
        )
          throw new Error('Invalid membership record.');
        const wallet = member.owner.toBase58();
        const mask = BigInt(member.paid_mask.toString());
        return {
          wallet,
          name: wallet === viewer ? 'You' : shortAddress(wallet),
          deposited: number(member.deposited),
          bond: number(member.bond_deposited),
          withdrawn: member.withdrawn,
          paidPeriods: Array.from({ length: r.periods }, (_, period) => period).filter(
            (period) => (mask & (1n << BigInt(period))) !== 0n,
          ),
        };
      })
      .sort((a, b) => a.wallet.localeCompare(b.wallet));
    return {
      id,
      name: r.name,
      creator: r.creator.toBase58(),
      amount: number(r.amount),
      bond: number(r.bond_amount),
      periods: r.periods,
      periodSeconds: number(r.period_seconds),
      startsAt: number(r.starts_at),
      maxMembers: r.max_members,
      members,
      emoji: '',
      color: '#E6EFD8',
    };
  }

  async myRounds(owner: PublicKey): Promise<Round[]> {
    const memberships = await this.connection.getProgramAccounts(this.config.programId, {
      commitment: 'confirmed',
      filters: [filter('Member'), { memcmp: { offset: 40, bytes: owner.toBase58() } }],
    });
    const ids = [
      ...new Set(
        memberships.map(({ account }) =>
          coder.accounts.decode<WireMember>('Member', account.data).round.toBase58(),
        ),
      ),
    ];
    const rounds: Round[] = [];
    // Small batches keep public RPC usage reasonable as a user's history grows.
    for (let i = 0; i < ids.length; i += 4)
      rounds.push(
        ...(await Promise.all(
          ids.slice(i, i + 4).map((id) => this.fetchRound(id, owner.toBase58())),
        )),
      );
    return rounds.sort((a, b) => b.startsAt - a.startsAt);
  }

  async create(owner: PublicKey, input: CreateInput, submit: Submit) {
    await this.verifyDeployment();
    validateRules(input, await this.chainTime());
    const funds = await this.balances(owner);
    if (funds.bond < input.bond)
      throw new UserFacingError(
        'You need more SKR for this commitment lock. Add SKR or lower the lock amount.',
      );
    const nonce = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
    const address = roundAddress(owner, nonce, this.config.programId);
    const signature = await submit(
      [
        createInstruction(this.config, owner, nonce, input),
        ...joinInstructions(this.config, address, owner),
      ],
      'Create and join ROUND',
    );
    return { signature, id: address.toBase58() };
  }

  async act(
    id: string,
    owner: PublicKey,
    action: 'join' | 'contribute' | 'withdraw',
    submit: Submit,
  ) {
    await this.verifyDeployment();
    const round = await this.fetchRound(id, owner.toBase58()); // Reject foreign programs/mints before signing.
    if (action !== 'withdraw') {
      const funds = await this.balances(owner);
      if (action === 'contribute' && funds.savings < round.amount)
        throw new UserFacingError(
          'You need more USDC for this contribution. Add USDC, then try again.',
        );
      if (action === 'join' && funds.bond < round.bond)
        throw new UserFacingError('You need more SKR to join this ROUND. Add SKR, then try again.');
    }
    const address = new PublicKey(id);
    const instructions =
      action === 'join'
        ? joinInstructions(this.config, address, owner)
        : action === 'withdraw'
          ? withdrawInstructions(this.config, address, owner)
          : [contributeInstruction(this.config, address, owner)];
    const signature = await submit(
      instructions,
      action === 'join'
        ? 'Join ROUND'
        : action === 'contribute'
          ? 'Contribute savings'
          : 'Withdraw savings',
    );
    return { signature, id };
  }
}
