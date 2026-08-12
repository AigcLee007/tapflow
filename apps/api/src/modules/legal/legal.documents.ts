export type LegalDocumentType = "terms" | "privacy";

export type LegalSection = {
  id: string;
  title: string;
  paragraphs: string[];
  items?: string[];
};

export type LegalDocument = {
  effectiveAt: string;
  lastUpdatedAt: string;
  operatorName: "Aittco";
  sections: LegalSection[];
  title: string;
  type: LegalDocumentType;
  version: string;
};

export const CURRENT_LEGAL_VERSION = "2026-08-12";

const documentMetadata = {
  effectiveAt: CURRENT_LEGAL_VERSION,
  lastUpdatedAt: CURRENT_LEGAL_VERSION,
  operatorName: "Aittco" as const,
  version: CURRENT_LEGAL_VERSION,
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentType, LegalDocument> = {
  terms: {
    ...documentMetadata,
    title: "Aittco 用户协议",
    type: "terms",
    sections: [
      { id: "scope", title: "一、协议范围、接受与更新", paragraphs: ["本协议适用于您使用 Aittco 通过 TapFlow 产品提供的服务。注册、登录或继续使用服务，即表示您已阅读、理解并同意本协议。", "Aittco 可在法律允许的范围内更新本协议；重大变更将通过适当方式通知，并可能要求您重新确认后继续使用服务。"] },
      { id: "operator", title: "二、服务主体与产品", paragraphs: ["本服务的运营主体为 Aittco。TapFlow 是 Aittco 提供的产品和服务名称，不作为本协议项下的独立运营主体。"] },
      { id: "account", title: "三、账户与安全", paragraphs: ["您应提供真实、准确、完整的信息，并妥善保管账户凭据。因您未妥善保管凭据、授权他人使用账户或违反本协议造成的后果，由您自行承担。", "如发现异常使用、风险活动或信息不实，Aittco 可采取验证、限制、暂停或终止账户等合理措施。"] },
      { id: "services", title: "四、服务内容", paragraphs: ["TapFlow 可提供 AI Flow 工作区、项目、画布、提示词、生成媒体、资产、计费及相关功能。具体功能、可用性和适用范围以服务实际展示为准。"] },
      { id: "ai-output", title: "五、AI 输出与用户审核", paragraphs: ["AI 生成内容具有不确定性。您应在使用、发布、传播或依赖生成结果前进行必要审核。Aittco 不保证输出准确、唯一、合法、无侵权或适合特定用途。"] },
      { id: "user-content", title: "六、用户内容与权利", paragraphs: ["您保留依法享有的用户内容权利，并保证对上传素材、提示词及提交内容拥有必要权利、许可和授权。为提供服务，您授予 Aittco 在必要范围内处理该等内容的许可。", "您对提示词、上传内容、生成结果的使用、发布及由此产生的责任负责。"] },
      { id: "prohibited", title: "七、禁止行为", paragraphs: ["您不得利用服务从事违法或损害他人权益的行为。"], items: ["制作、传播违法、有害、欺诈、侮辱、骚扰或恶意内容。", "侵犯他人知识产权、隐私、肖像、商业秘密或其他合法权益。", "绕过访问限制、干扰服务安全、滥用资源或以自动化方式攻击服务。", "冒用身份、规避计费规则或从事其他违反适用法律法规的行为。"] },
      { id: "billing", title: "八、积分与计费", paragraphs: ["服务可能按积分或其他方式计费。执行前可展示成本估算；系统可为任务预留积分，成功后结算，失败时按适用规则释放或退款。", "价格、可用额度和计费规则可能调整；Aittco 将在适当情况下通知您。"] },
      { id: "third-party", title: "九、第三方依赖", paragraphs: ["为完成您请求的功能，服务可能依赖第三方模型、云基础设施、对象存储、邮件、支付或其他供应商。该等第三方服务的可用性和规则可能影响服务体验。"] },
      { id: "changes", title: "十、服务变更与终止", paragraphs: ["Aittco 可基于运营、安全、法律或产品需要调整、暂停或终止部分服务。对于违反本协议、存在安全风险或依法应当限制的账户，Aittco 可采取相应措施。"] },
      { id: "intellectual-property", title: "十一、知识产权", paragraphs: ["Aittco 及 TapFlow 的软件、界面、标识、文档及其他产品材料受法律保护。未经权利人书面许可，您不得擅自复制、修改、出租、出售或用于其他商业用途。"] },
      { id: "liability", title: "十二、免责声明与责任限制", paragraphs: ["在适用法律允许的最大范围内，服务按“现状”和“可用”基础提供。因网络、第三方服务、不可抗力、用户操作或其他非 Aittco 可合理控制的原因造成的损失，Aittco 在法律允许范围内不承担责任。"] },
      { id: "contact", title: "十三、联系与生效", paragraphs: ["如您有投诉、咨询或法律相关请求，请通过本页面公布的联系渠道与 Aittco 联系。本协议自生效日期起生效，并受适用法律法规约束。"] },
    ],
  },
  privacy: {
    ...documentMetadata,
    title: "Aittco 隐私政策",
    type: "privacy",
    sections: [
      { id: "scope", title: "一、适用范围", paragraphs: ["本政策说明 Aittco 通过 TapFlow 产品提供服务时如何处理个人信息。Aittco 是相关个人信息处理者，TapFlow 是产品和服务名称。"] },
      { id: "account", title: "二、我们处理的信息", paragraphs: ["为创建和管理账户，我们可能处理您的邮箱地址和可选显示名称。为保障认证和安全，我们还可能处理登录、设备、网络、安全验证及审计相关信息。"] },
      { id: "service-data", title: "三、服务数据", paragraphs: ["为提供工作区、项目、画布、提示词、资产、生成媒体、计费和运行支持，我们处理您提交的项目数据、操作记录、用量与必要的运营元数据。"] },
      { id: "ai-providers", title: "四、AI 与服务提供商", paragraphs: ["仅在完成您主动请求的生成任务所必需的范围内，相关提示词、输入或必要上下文可能发送至您选择的 AI 服务提供商。", "我们可使用对象存储、数据库、队列、邮件、可观测性及其他基础设施服务提供商来运行服务。"] },
      { id: "purposes", title: "五、处理目的与最小必要", paragraphs: ["我们按照最小必要原则处理信息，用于提供、维护、保护和改进服务，处理计费、安全防护、响应请求及履行法律义务。"] },
      { id: "retention", title: "六、保存、删除与备份", paragraphs: ["我们在实现处理目的所需期间保存信息，并可能因备份、安全、争议处理或法律合规要求保留必要记录。账户或内容删除后，部分备份可能在合理周期后清除。"] },
      { id: "rights", title: "七、您的权利", paragraphs: ["在适用法律规定的范围内，您可请求访问、更正、导出、删除个人信息，申请注销账户或提交隐私请求。请通过本页面公布的联系渠道提出请求。"] },
      { id: "browser-storage", title: "八、Cookie 与浏览器存储", paragraphs: ["服务可能使用必要的 Cookie、浏览器本地存储和受信任设备令牌，以维持会话、安全或界面偏好。", "“记住账号”功能仅在您的浏览器中保存邮箱地址。Aittco 不接收或存储浏览器密码管理器保存的密码。"] },
      { id: "security", title: "九、安全与事件响应", paragraphs: ["我们采用合理的技术和管理措施保护信息安全。发生可能影响个人信息安全的事件时，我们将按适用法律法规采取处置和通知措施。"] },
      { id: "cross-region", title: "十、跨区域与第三方处理", paragraphs: ["在使用第三方模型或基础设施时，信息可能在相关服务商运营的地区处理。我们会根据适用法律法规采取必要保障措施。"] },
      { id: "minors", title: "十一、未成年人", paragraphs: ["如您未达到适用法律规定的最低使用年龄，请在监护人同意和指导下使用服务。我们不故意收集不符合条件未成年人的信息。"] },
      { id: "updates", title: "十二、政策更新", paragraphs: ["我们可能更新本政策。重大变更将以适当方式通知；必要时，我们会要求您重新确认当前版本。"] },
      { id: "contact", title: "十三、联系与生效", paragraphs: ["如您有隐私相关问题或请求，请通过本页面公布的联系渠道联系 Aittco。本政策自生效日期起生效。"] },
    ],
  },
};
