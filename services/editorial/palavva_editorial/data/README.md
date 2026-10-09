# common-words-web2.txt.gz

Lower-case entries (3 to 16 letters) of `web2`, Webster's Second International Dictionary word list as shipped
in BSD/macOS `/usr/share/dict`. Its README states the 1934 copyright has lapsed (public domain).

It is used only by `translate.fidelity` to decide whether a capitalised token in English source text is an
ordinary word ("Grade", "Education", "Billion": translators legitimately translate these) or a proper name
("Ramaphosa", "Ntshavheni": these must survive translation verbatim).

Known limit: a name that is also an ordinary word ("Bloom", "Grace") is not checked by this rule.
