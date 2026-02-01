from typing import Dict
from .types import ContractType

from .general import HINT as GENERAL_HINT
from .marriage import HINT as MARRIAGE_HINT
from .house_sale import HINT as HOUSE_SALE_HINT
from .vehicle_sale import HINT as VEHICLE_SALE_HINT
from .lease import HINT as LEASE_HINT
from .employment import HINT as EMPLOYMENT_HINT
from .nda import HINT as NDA_HINT
from .service import HINT as SERVICE_HINT

PROMPT_VERSION = "p_v3"

TYPE_HINTS: Dict[str, str] = {
    "general": GENERAL_HINT,
    "marriage": MARRIAGE_HINT,
    "house_sale": HOUSE_SALE_HINT,
    "vehicle_sale": VEHICLE_SALE_HINT,
    "lease": LEASE_HINT,
    "employment": EMPLOYMENT_HINT,
    "nda": NDA_HINT,
    "service": SERVICE_HINT,
}

def validate_contract_type(t: str) -> str:
    return t if t in TYPE_HINTS else "general"

def build_system_prompt(contract_type: str, identity: str) -> str:
    t = validate_contract_type(contract_type)
    party = "甲方" if identity == "A" else "乙方"

    # ✅ base：产品定位（人话 + 风险提醒，不是法律意见）
    base_rules = (
        "你是合同风险审阅助手，面向普通用户，用通俗中文解释合同风险与建议。"
        "你提供的是“签前风险提醒与谈判建议”，不构成法律意见。"
        "你将结合中国法律与常见合同实践识别风险。"
    )

    # ✅ output_rules：强约束输出结构
    output_rules = (
        "只输出严格JSON（不要markdown、不要解释、不要多余字段）。"
        "JSON字段必须且仅包含：score(0-100), riskSummary, originalContent, clauses。"
        "clauses元素字段：section,title,originalText,explanation,suggestion,level(HIGH/MEDIUM/LOW)。"
        "score含义：0=极高风险，100=风险很低。"
        "clauses最多输出12条，优先输出最影响签署安全的条款。"
        "riskSummary 梳理整份合同，输出概括性、整体性的风险评估。"
    )

    # ✅ role_rules：强制甲乙差异（这是解决你问题的关键）
    role_rules = (
        f"你必须严格站在{party}立场，只识别与{party}利益/风险直接相关的点。\n"
        f"禁止输出“对双方都一样”的泛泛建议（如：条款不清晰、建议明确），"
        f"除非你说明该模糊将如何具体伤害{party}。\n"
        f"每条 clause 的 explanation/suggestion 必须体现：如果我是{party}，我为什么吃亏/我该怎么改/我该如何谈。\n"
        f"对{party}明显有利、风险很低的条款一般不要输出（除非它掩盖了对方风险或存在反噬）。\n"
        f"score 含义：0=对{party}极高风险，100=对{party}风险很低（注意：是站在该方立场的分数）。"
    )

    return (
        f"{base_rules}\n"
        f"{role_rules}\n"
        f"{output_rules}\n"
        f"合同类型：{t}。\n"
        f"审阅重点：{TYPE_HINTS[t]}\n"
        f"输出语言：中文。\n"
        f"再次强调：只输出JSON字符串本体。"
    )
