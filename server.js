const express = require("express");
const { ApiPromise, WsProvider } = require("@polkadot/api");
const { Keyring } = require("@polkadot/keyring");
const { cryptoWaitReady } = require("@polkadot/util-crypto");

const app = express();
const PORT = 3000;
const RPC = "wss://entrypoint-finney.opentensor.ai:443";

app.use(express.json());
app.use(express.static("public"));

// SSE: 流式推送 mint 进度
app.post("/mint", async (req, res) => {
  const { mnemonic, tick, amt, count, delay, protocol } = req.body;

  if (!mnemonic) {
    return res.status(400).json({ error: "请填写助记词" });
  }

  // 设置 SSE 响应头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    await cryptoWaitReady();

    const keyring = new Keyring({ type: "sr25519", ss58Format: 42 });
    let account;
    try {
      account = keyring.addFromMnemonic(mnemonic.trim());
    } catch (e) {
      send({ type: "error", msg: "助记词无效：" + e.message });
      return res.end();
    }

    send({ type: "info", msg: `钱包地址: ${account.address}` });

    const inscription = JSON.stringify({
      p: protocol || "tao-20",
      op: "mint",
      tick: tick || "TAOS",
      amt: String(amt || "420"),
    });
    send({ type: "info", msg: `铭文内容: ${inscription}` });
    send({ type: "info", msg: "正在连接节点..." });

    const provider = new WsProvider(RPC);
    const api = await ApiPromise.create({ provider });
    await api.isReady;

    const chain = await api.rpc.system.chain();
    const header = await api.rpc.chain.getHeader();
    send({ type: "info", msg: `已连接: ${chain} | 区块: ${header.number}` });

    const total = parseInt(count) || 1;
    const delayMs = (parseFloat(delay) || 6) * 1000;
    let success = 0;
    let fail = 0;

    for (let i = 1; i <= total; i++) {
      send({ type: "progress", current: i, total, msg: `[${i}/${total}] 发送中...` });

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
        success++;
        send({ type: "success", current: i, total, msg: `[${i}/${total}] 成功 | ${txHash}` });
      } catch (e) {
        fail++;
        send({ type: "fail", current: i, total, msg: `[${i}/${total}] 失败: ${e.message}` });
      }

      if (i < total) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    send({ type: "done", success, fail, total });
    await api.disconnect();
  } catch (e) {
    send({ type: "error", msg: "发生错误: " + e.message });
  }

  res.end();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Taoscriptions Mint 工具已启动: http://0.0.0.0:${PORT}`);
});
