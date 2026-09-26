import { BorshCoder, BN, type Idl } from '@coral-xyz/anchor';
import { Buffer } from 'buffer';
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import generatedIdl from './round.json';
import { type CreateInput } from '../domain/round';

export const ROUND_IDL = generatedIdl as Idl;
export const DEFAULT_PROGRAM_ID = new PublicKey(ROUND_IDL.address);
export const coder = new BorshCoder(ROUND_IDL);
export type ChainConfig = { programId: PublicKey; savingsMint: PublicKey; bondMint: PublicKey };
export const u64 = (value: number | bigint) => new BN(value.toString());

export function roundAddress(creator: PublicKey, nonce: bigint, programId = DEFAULT_PROGRAM_ID) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('round'), creator.toBuffer(), bytes],
    programId,
  )[0];
}
export function memberAddresses(
  round: PublicKey,
  owner: PublicKey,
  programId = DEFAULT_PROGRAM_ID,
) {
  const member = PublicKey.findProgramAddressSync(
    [Buffer.from('member'), round.toBuffer(), owner.toBuffer()],
    programId,
  )[0];
  return {
    member,
    savings_vault: PublicKey.findProgramAddressSync(
      [Buffer.from('savings'), member.toBuffer()],
      programId,
    )[0],
    bond_vault: PublicKey.findProgramAddressSync(
      [Buffer.from('bond'), member.toBuffer()],
      programId,
    )[0],
  };
}

// Account order and instruction encoding come from the Rust-generated IDL.
export function instruction(
  name: string,
  accounts: Record<string, PublicKey>,
  args: Record<string, unknown>,
  programId = DEFAULT_PROGRAM_ID,
) {
  const definition = ROUND_IDL.instructions.find((ix) => ix.name === name);
  if (!definition) throw new Error(`Unknown ROUND instruction: ${name}`);
  return new TransactionInstruction({
    programId,
    keys: definition.accounts.map((account) => {
      if ('accounts' in account) throw new Error('Nested account groups are not supported.');
      const pubkey =
        accounts[account.name] ?? (account.address ? new PublicKey(account.address) : undefined);
      if (!pubkey) throw new Error(`Missing instruction account: ${account.name}`);
      return { pubkey, isSigner: account.signer ?? false, isWritable: account.writable ?? false };
    }),
    data: coder.instruction.encode(name, args),
  });
}

export function createInstruction(
  config: ChainConfig,
  creator: PublicKey,
  nonce: bigint,
  input: CreateInput,
) {
  return instruction(
    'create_round',
    {
      creator,
      round: roundAddress(creator, nonce, config.programId),
      savings_mint: config.savingsMint,
      bond_mint: config.bondMint,
      system_program: SystemProgram.programId,
    },
    {
      nonce: u64(nonce),
      args: {
        name: input.name.trim(),
        amount: u64(input.amount),
        bond_amount: u64(input.bond),
        period_seconds: u64(input.periodSeconds),
        periods: input.periods,
        starts_at: u64(input.startsAt),
        max_members: input.maxMembers,
      },
    },
    config.programId,
  );
}

export function memberAccounts(config: ChainConfig, round: PublicKey, owner: PublicKey) {
  return {
    owner,
    round,
    ...memberAddresses(round, owner, config.programId),
    savings_mint: config.savingsMint,
    bond_mint: config.bondMint,
    owner_savings: getAssociatedTokenAddressSync(config.savingsMint, owner),
    owner_bond: getAssociatedTokenAddressSync(config.bondMint, owner),
    token_program: TOKEN_PROGRAM_ID,
    system_program: SystemProgram.programId,
  };
}

export function joinInstructions(config: ChainConfig, round: PublicKey, owner: PublicKey) {
  const accounts = memberAccounts(config, round, owner);
  return [
    createAssociatedTokenAccountIdempotentInstruction(
      owner,
      accounts.owner_bond,
      owner,
      config.bondMint,
    ),
    instruction('join_round', accounts, {}, config.programId),
  ];
}
export function contributeInstruction(config: ChainConfig, round: PublicKey, owner: PublicKey) {
  return instruction('contribute', memberAccounts(config, round, owner), {}, config.programId);
}
export function withdrawInstructions(config: ChainConfig, round: PublicKey, owner: PublicKey) {
  const accounts = memberAccounts(config, round, owner);
  return [
    createAssociatedTokenAccountIdempotentInstruction(
      owner,
      accounts.owner_savings,
      owner,
      config.savingsMint,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      owner,
      accounts.owner_bond,
      owner,
      config.bondMint,
    ),
    instruction('withdraw', accounts, {}, config.programId),
  ];
}
