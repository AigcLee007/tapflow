import React, { useEffect, useState } from "react";

import { LOGIN_ROUTE } from "../app/routes";
import { getLegalDocument, type LegalDocument, type LegalDocumentType } from "./legalApi";
import "./legalDocumentPage.css";

type LegalDocumentPageProps = {
  type: LegalDocumentType;
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${year} 年 ${month} 月 ${day} 日` : value;
}

export function LegalDocumentPage({ type }: LegalDocumentPageProps) {
  const [document, setDocument] = useState<LegalDocument | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setDocument(null);
    setLoadError(false);

    void getLegalDocument(type).then(
      (result) => {
        if (active) setDocument(result);
      },
      () => {
        if (active) setLoadError(true);
      },
    );

    return () => {
      active = false;
    };
  }, [reloadKey, type]);

  if (loadError) {
    return (
      <main className="legal-page legal-page--status">
        <p role="alert">协议暂时无法加载，请稍后重试。</p>
        <button onClick={() => setReloadKey((value) => value + 1)} type="button">重新加载</button>
        <a href={LOGIN_ROUTE}>返回登录</a>
      </main>
    );
  }

  if (!document) {
    return <main className="legal-page legal-page--status" aria-busy="true">正在加载协议…</main>;
  }

  return (
    <main className="legal-page">
      <header className="legal-page__header">
        <a className="legal-page__back" href={LOGIN_ROUTE}>返回登录</a>
        <span className="legal-page__brand">AITTCO</span>
      </header>
      <div className="legal-page__layout">
        <nav aria-label="协议目录" className="legal-page__toc">
          <strong>目录</strong>
          {document.sections.map((section) => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}
        </nav>
        <article className="legal-page__article">
          <header className="legal-page__intro">
            <p className="legal-page__eyebrow">Aittco 法律文件</p>
            <h1>{document.title}</h1>
            <div className="legal-page__metadata">
              <div>运营主体：{document.operatorName}</div>
              <div>生效日期：{formatDate(document.effectiveAt)}</div>
              <div>更新日期：{formatDate(document.lastUpdatedAt)}</div>
              <div>版本：{document.version}</div>
            </div>
          </header>
          {document.sections.map((section) => (
            <section id={section.id} key={section.id}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.items?.length ? <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            </section>
          ))}
          {document.contactUrl ? <p className="legal-page__contact">如需联系 Aittco，请访问 <a href={document.contactUrl} rel="noreferrer" target="_blank">联系我们</a>。</p> : null}
        </article>
      </div>
    </main>
  );
}
