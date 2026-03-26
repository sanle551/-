#!/usr/bin/env node
/**
 * Taoscriptions Auto-Mint Script (Node.js版)
 * 自动批量 mint TAO-20 铭文
 *
 * 依赖安装:
 *   npm install @polkadot/api @polkadot/keyring @polkadot/util-crypto
 *
 * 用法:
 *   node auto_mint.js --mnemonic "单词1 单词2 ..." --tick TAOS --amt 420 --count 10
 *   node auto_mint.js --mnemonic "单词1 单词2 ..." --count 10 --delay 6
 */

const { ApiPromise, WsProvider } = require("@polkadot/api");
const { Keyring } = require("@polkadot/keyring");
const { cryptoWaitReady } = require("@polkadot/util-crypto");

const DEFAULT_RPC = "wss://entrypoint-finney.opentensor.ai:443";

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    mnemonic: null,
    seed: null,
    tick: "TAOS",
    amt: "420",
    protocol: "tao-20",
    count: 1,
    delay: 6,
    rpc: DEFAULT_RPC,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--mnemonic": result.mnemonic = args[++i]; break;
      case "--seed":     result.seed     = args[++i]; break;
      case "--tick":     result.tick     = args[++i]; break;
      case "--amt":      result.amt      = args[++i]; break;
      case "--protocol": result.protocol = args[++i]; break;
      case "--count":    result.count    = parseInt(args[++i]); break;
      case "--delay":    result.delay    = parseFloat(args[++i]); break;
      case "--rpc":      result.rpc      = args[++i]; break;
    }
  }

  if (!result.mnemonic && !result.seed) {
    console.error("错误: 请提供 --mnemonic 或 --seed 参数");
    process.exit(1);
  }

  return result;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const opts = parseArgs();

  await cryptoWaitReady();

  // 加载钱包
  const keyring = new Keyring({ type: "sr25519", ss58Format: 42 });
  let account;
  try {
    if (opts.mnemonic) {
      account = keyring.addFromMnemonic(opts.mnemonic);
    } else {
      account = keyring.addFromUri(opts.seed);
    }
  } catch (e) {
    console.error("错误: 钱包加载失败 -", e.message);
    process.exit(1);
  }

  console.log("钱包地址:", account.address);

  // 构建铭文
  const inscription = JSON.stringify({
    p: opts.protocol,
    op: "mint",
    tick: opts.tick,
    amt: opts.amt,
  });
  console.log("铭文内容:", inscription);
  console.log(`计划 mint: ${opts.count} 次，间隔 ${opts.delay} 秒`);
  console.log("-".repeat(50));

  // 连接节点
  console.log("连接节点:", opts.rpc);
  const provider = new WsProvider(opts.rpc);
  const api = await ApiPromise.create({ provider });
  await api.isReady;

  const chain = await api.rpc.system.chain();
  const block = await api.rpc.chain.getHeader();
  console.log(`已连接: ${chain} (区块高度: ${block.number})`);
  console.log("-".repeat(50));

  let successCount = 0;
  let failCount = 0;

  for (let i = 1; i <= opts.count; i++) {
    process.stdout.write(`[${i}/${opts.count}] 正在发送 mint 交易...`);
    try {
      const txHash = await new Promise((resolve, reject) => {
        api.tx.system
          .remark(inscription)
          .signAndSend(account, ({ status, dispatchError }) => {
            if (status.isInBlock) {
              if (dispatchError) {
                reject(new Error(dispatchError.toString()));
              } else {
                resolve(status.asInBlock.toHex());
              }
            }
          })
          .catch(reject);
      });
      successCount++;
      console.log(`\n  [成功] 区块哈希: ${txHash}`);
    } catch (e) {
      failCount++;
      console.log(`\n  [失败] ${e.message}`);
    }

    if (i < opts.count) {
      await sleep(opts.delay * 1000);
    }
  }

  console.log("-".repeat(50));
  console.log(`完成！成功: ${successCount}，失败: ${failCount}`);

  await api.disconnect();
}

main().catch((e) => {
  console.error("致命错误:", e.message);
  process.exit(1);
});
