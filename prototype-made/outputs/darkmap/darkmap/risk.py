import re
from difflib import SequenceMatcher
from urllib.parse import urlsplit
from .schemas import Assessment, Finding

CATEGORIES = ['impersonation','counterfeit','scam','suspicious_naming','logo_misuse','risky_urls','giveaway_payment','fake_support','credential_harvesting','coordinated_abuse']

def evidence_map(payload):
    e = payload['entity']
    evidence = {k: e[k] for k in ('account','display_name','bio','caption') if e.get(k)}
    evidence.update({f'url:{i}': u for i,u in enumerate(e.get('urls', []))})
    evidence.update({f'logo:{i}': ', '.join(m.get('observed_logos', [])) for i,m in enumerate(e.get('media', [])) if m.get('observed_logos')})
    if payload['shared_url_accounts']:
        evidence['shared_url_accounts'] = ', '.join(payload['shared_url_accounts'])
    return evidence

def rules(payload):
    e,b = payload['entity'],payload['brand']
    text = ' '.join([e['account'],e['display_name'],e['bio'],e['caption']]).casefold()
    name = re.sub(r'\W','',b['name'].casefold())
    account = re.sub(r'\W','',e['account'])
    branded = name in re.sub(r'\W','',text)
    official = e['account'] in {x.lower().lstrip('@') for x in b['official_accounts']}
    findings = []
    ev = evidence_map(payload)
    def add(category,score,explanation,refs,confidence=.65):
        findings.append(Finding(category=category,score=score,confidence=confidence,evidence=refs,explanation=explanation))
    def matches(words):
        return [k for k,v in ev.items() if k in ('bio','caption','display_name','account') and any(re.search(r'\b'+re.escape(w)+r'\b',v.casefold()) for w in words)]
    support = matches(['support','helpdesk','customer service'])
    claim = matches(['official','verified'])
    if not official and (name in account or SequenceMatcher(None,name,account).ratio() > .8):
        add('suspicious_naming',35,'Account resembles the monitored brand; resemblance alone is not proof of abuse.',['account'],.5)
    if branded and not official and (support or claim):
        add('impersonation',70,'Unrecognized account claims an official or support role.', list(dict.fromkeys(['account']+claim+support)))
        if support:
            add('fake_support',75,'Brand-associated support language from an account outside the official allowlist.',support)
    creds = matches(['send your password','share your password','verification code','seed phrase','otp','enter your password'])
    if creds:
        add('credential_harvesting',90,'Credential or recovery-secret request language requires urgent human review.',creds,.8)
        add('scam',85,'Credential request is a strong scam indicator, subject to context review.',creds,.75)
    counterfeit = matches(['replica','counterfeit','1:1 copy','fake designer'])
    if branded and counterfeit:
        add('counterfeit',70,'Brand mention with replica/counterfeit language; commentary or reporting can be benign.',counterfeit)
    giveaway,payment = matches(['giveaway','winner','prize']),matches(['pay','fee','deposit','crypto','gift card'])
    if giveaway and payment:
        add('giveaway_payment',80,'Prize language appears with a payment request or payment terminology.',sorted(set(giveaway+payment)),.7)
    risky = []
    domains = [d.casefold().strip('. ') for d in b['official_domains']]
    for i,url in enumerate(e['urls']):
        try:
            parsed = urlsplit(url)
            host = (parsed.hostname or '').casefold()
            trusted = any(host == d or host.endswith('.'+d) for d in domains)
            if not trusted and (parsed.username or host.startswith('xn--') or (branded and any(t in url.casefold() for t in ['login','verify','claim','payment']))):
                risky.append(f'url:{i}')
        except ValueError:
            risky.append(f'url:{i}')
    if risky:
        add('risky_urls',70,'Unrecognized URL has deceptive or credential/payment-related structure. Destination was not fetched.',risky)
    logos = [k for k,v in ev.items() if k.startswith('logo:') and b['name'].casefold() in v.casefold()]
    if logos and not official and (support or claim or counterfeit):
        add('logo_misuse',60,'Supplied logo observation accompanies other abuse indicators; logo authorization is unverified.',logos,.5)
    if len(payload['shared_url_accounts']) >= 2 and (creds or risky or counterfeit):
        add('coordinated_abuse',55,'At least three accounts share an exact URL, alongside another indicator; coordination remains a hypothesis.',['shared_url_accounts'] + [f'url:{i}' for i in range(len(e['urls']))],.45)
    return Assessment(findings=findings, limitations=['Heuristic triage, not a calibrated probability or proof of wrongdoing.', 'No media pixels or outbound destinations were fetched; logo observations are supplied metadata.', 'Coordination context is limited to 1,000 stored entities for this brand at ingestion time.'])

def finalize(assessment, payload, provider, model):
    evidence = evidence_map(payload)
    # Reject unsupported citations and duplicate categories instead of accepting invented evidence.
    categories = set()
    for finding in assessment.findings:
        if finding.category in categories or any(ref not in evidence for ref in finding.evidence):
            raise ValueError('Invalid or duplicate finding evidence')
        categories.add(finding.category)
    scores = {c: 0 for c in CATEGORIES}
    scores.update({f.category: f.score for f in assessment.findings})
    score = max(scores.values())
    confidence = max((f.confidence for f in assessment.findings if f.score == score),default=0.0)
    result = assessment.model_dump()
    result.update(score=score, category_scores=scores, confidence=confidence,
                  recommended_action='urgent_human_review' if score>=80 else 'human_review' if score>=50 else 'monitor',
                  evidence=evidence, provider=provider, model=model,
                  score_policy='Maximum category score; confidence is analyst certainty, not probability of abuse.',
                  entity_id=payload['entity']['external_id'], provenance=payload['entity']['provenance'])
    return result
