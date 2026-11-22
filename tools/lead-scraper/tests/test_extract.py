from leads.extract import (
    FoundEmail, Person, clean_email, deobfuscate, extract_emails, extract_people, rank_emails,
)


def emails_of(html):
    return [f.email for f in extract_emails(html)]


def test_mailto_and_text_emails():
    html = """<html><body>
      <a href="mailto:Jane.Smith@SmithLaw.com?subject=Hi">Email Jane</a>
      <p>Questions? Write to office@smithlaw.com today.</p>
    </body></html>"""
    found = extract_emails(html)
    assert [(f.email, f.source) for f in found] == [
        ("jane.smith@smithlaw.com", "mailto"),
        ("office@smithlaw.com", "page_text"),
    ]


def test_html_entities_and_data_attributes():
    html = '<div data-email="intake&#64;desertlaw.com"></div><p>info&#64;desertlaw.com</p>'
    assert set(emails_of(html)) == {"intake@desertlaw.com", "info@desertlaw.com"}


def test_junk_emails_are_dropped():
    html = '<img src="logo@2x.png"><p>name@example.com abc@sentry.io real@firm.com</p>'
    assert emails_of(html) == ["real@firm.com"]
    assert clean_email("photo@banner.jpg") is None


def test_obfuscations():
    text = "Reach jane [at] smithlaw [dot] com or bob(at)smithlaw(dot)com or amy AT smithlaw DOT com"
    assert deobfuscate(text) == ["jane@smithlaw.com", "bob@smithlaw.com", "amy@smithlaw.com"]
    assert deobfuscate("Contact us at info at the office. Email sue at desertcpa dot com.") == ["sue@desertcpa.com"]


def test_obfuscated_email_found_in_page():
    html = "<p>Email: maria {at} valleycpa {dot} com</p>"
    found = extract_emails(html)
    assert [(f.email, f.source) for f in found] == [("maria@valleycpa.com", "obfuscated")]


def test_plain_words_with_at_are_not_emails():
    assert deobfuscate("We are at the office at noon. Call us at home.") == []


def test_people_and_titles():
    text = "Meet Our Team\nJane Smith\nManaging Partner\nRobert Lee, Associate Attorney\nOur Practice Areas\nMaria Garcia, CPA"
    people = {(p.first_name, p.last_name): p.title for p in extract_people(text)}
    assert people[("Jane", "Smith")] == "Managing Partner"
    assert people[("Robert", "Lee")] == "Associate Attorney"
    assert ("Maria", "Garcia") in people
    assert ("Our", "Practice") not in people


def test_ranking_named_person_beats_role_and_keeps_two():
    found = [
        FoundEmail("info@smithlaw.com", "mailto"),
        FoundEmail("jsmith@smithlaw.com", "page_text"),
        FoundEmail("paralegal2@smithlaw.com", "page_text"),
        FoundEmail("careers@smithlaw.com", "page_text"),
    ]
    ranked = rank_emails(found, "smithlaw.com", [Person("Jane", "Smith", "Partner")])
    assert [r.email for r in ranked] == ["jsmith@smithlaw.com", "paralegal2@smithlaw.com"]
    assert ranked[0].person.last_name == "Smith"


def test_ranking_drops_other_domains_and_blocked_roles():
    found = [
        FoundEmail("hello@webdesignco.com", "page_text"),
        FoundEmail("noreply@smithlaw.com", "page_text"),
        FoundEmail("office@smithlaw.com", "page_text"),
    ]
    assert [r.email for r in rank_emails(found, "smithlaw.com", [])] == ["office@smithlaw.com"]


def test_webmail_only_when_nothing_on_domain_and_flagged():
    found = [FoundEmail("desertroofing@gmail.com", "mailto")]
    ranked = rank_emails(found, "desertroofingaz.com", [])
    assert ranked[0].email == "desertroofing@gmail.com" and ranked[0].webmail

    found.append(FoundEmail("info@desertroofingaz.com", "page_text"))
    ranked = rank_emails(found, "desertroofingaz.com", [])
    assert [r.email for r in ranked] == ["info@desertroofingaz.com"]
    assert not ranked[0].webmail


def test_subdomain_counts_as_own_domain():
    ranked = rank_emails([FoundEmail("amy@mail.smithlaw.com", "mailto")], "smithlaw.com", [])
    assert ranked and not ranked[0].webmail
