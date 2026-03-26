#!/usr/bin/env python3
"""
Taoscriptions Auto-Mint Script
自动批量 mint TAO-20 铭文

依赖安装:
    pip install substrate-interface

用法:
    python auto_mint.py --mnemonic "你的助记词" --tick TAOS --amt 420 --count 10
    python auto_mint.py --seed "0x私钥" --tick TAOS --amt 420 --count 10 --delay 6
"""

import argparse
import json
import time
import sys
from substrateinterface import SubstrateInterface, Keypair
from substrateinterface.exceptions import SubstrateRequestException


# Bittensor 主网 RPC 节点
DEFAULT_RPC = "wss://entrypoint-finney.opentensor.ai:443"

# 默认铭文协议
DEFAULT_PROTOCOL = "tao-20"


def build_inscription(protocol: str, tick: str, amt: str) -> str:
    """构建 mint 铭文 JSON 字符串"""
    data = {
        "p": protocol,
        "op": "mint",
        "tick": tick,
        "amt": str(amt),
    }
    return json.dumps(data, separators=(",", ":"))


def mint_once(substrate: SubstrateInterface, keypair: Keypair, inscription: str) -> str | None:
    """发送一次 system.remark 铭文交易，返回交易哈希或 None"""
    call = substrate.compose_call(
        call_module="System",
        call_function="remark",
        call_params={"remark": inscription.encode("utf-8").hex()},
    )

    extrinsic = substrate.create_signed_extrinsic(call=call, keypair=keypair)

    try:
        receipt = substrate.submit_extrinsic(extrinsic, wait_for_inclusion=True)
        return receipt.extrinsic_hash
    except SubstrateRequestException as e:
        print(f"  [错误] 交易提交失败: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Taoscriptions TAO-20 自动 Mint 脚本")

    # 钱包参数（二选一）
    wallet_group = parser.add_mutually_exclusive_group(required=True)
    wallet_group.add_argument("--mnemonic", type=str, help="钱包助记词（12或24个单词）")
    wallet_group.add_argument("--seed", type=str, help="钱包私钥（0x 开头的十六进制）")

    # Mint 参数
    parser.add_argument("--tick", type=str, default="TAOS", help="铭文代码 (默认: TAOS)")
    parser.add_argument("--amt", type=str, default="420", help="每次 mint 数量 (默认: 420)")
    parser.add_argument("--protocol", type=str, default=DEFAULT_PROTOCOL, help=f"协议名称 (默认: {DEFAULT_PROTOCOL})")
    parser.add_argument("--count", type=int, default=1, help="mint 次数 (默认: 1)")
    parser.add_argument("--delay", type=float, default=6.0, help="每次 mint 之间的等待秒数 (默认: 6)")

    # 网络参数
    parser.add_argument("--rpc", type=str, default=DEFAULT_RPC, help=f"RPC 节点地址 (默认: {DEFAULT_RPC})")

    args = parser.parse_args()

    # 构建 Keypair
    try:
        if args.mnemonic:
            keypair = Keypair.create_from_mnemonic(args.mnemonic)
        else:
            keypair = Keypair.create_from_seed(args.seed)
    except Exception as e:
        print(f"[错误] 钱包加载失败: {e}")
        sys.exit(1)

    print(f"钱包地址: {keypair.ss58_address}")

    # 构建铭文
    inscription = build_inscription(args.protocol, args.tick, args.amt)
    print(f"铭文内容: {inscription}")
    print(f"计划 mint: {args.count} 次，间隔 {args.delay} 秒")
    print("-" * 50)

    # 连接节点
    print(f"连接节点: {args.rpc}")
    try:
        substrate = SubstrateInterface(url=args.rpc)
    except Exception as e:
        print(f"[错误] 节点连接失败: {e}")
        sys.exit(1)

    print(f"已连接: {substrate.chain} (区块高度: {substrate.get_block_number()})")
    print("-" * 50)

    success_count = 0
    fail_count = 0

    for i in range(1, args.count + 1):
        print(f"[{i}/{args.count}] 正在发送 mint 交易...")
        tx_hash = mint_once(substrate, keypair, inscription)

        if tx_hash:
            success_count += 1
            print(f"  [成功] 交易哈希: {tx_hash}")
        else:
            fail_count += 1

        if i < args.count:
            time.sleep(args.delay)

    print("-" * 50)
    print(f"完成！成功: {success_count}，失败: {fail_count}")


if __name__ == "__main__":
    main()
