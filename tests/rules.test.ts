import { describe, expect, it } from "vitest";
import { parseApex } from "../src/apex";
import { scan } from "../src/rules";

const ids = (code: string, file = "Test.cls") => scan(parseApex(code, file)).map((f) => `${f.rule_id}@${f.line}`);
const rules = (code: string, file = "Test.cls") => scan(parseApex(code, file)).map((f) => f.rule_id);

const cls = (body: string, header = "public with sharing class Demo") => `${header} {\n${body}\n}`;

describe("soql-in-loop", () => {
  it("flags a query inside a for loop", () => {
    expect(ids(cls("  void a(List<Account> xs) {\n    for (Account x : xs) {\n      Integer n = [SELECT COUNT() FROM Case WITH USER_MODE];\n    }\n  }"))).toContain("soql-in-loop@4");
  });
  it("flags Database.query inside a while loop", () => {
    expect(rules(cls("  void a() {\n    while (true) {\n      Database.query('SELECT Id FROM Account');\n    }\n  }"))).toContain("soql-in-loop");
  });
  it("does not flag a SOQL for loop header", () => {
    expect(rules(cls("  void a() {\n    for (Account a : [SELECT Id FROM Account WITH USER_MODE]) {\n      a.Name = 'x';\n    }\n  }"))).not.toContain("soql-in-loop");
  });
  it("does not flag a query after the loop has closed", () => {
    expect(rules(cls("  void a(List<Id> ids) {\n    for (Id i : ids) { }\n    List<Account> r = [SELECT Id FROM Account WITH USER_MODE];\n  }"))).not.toContain("soql-in-loop");
  });
  it("flags a query in a loop body without braces", () => {
    expect(rules(cls("  void a(List<Id> ids) {\n    for (Id i : ids) Database.query('SELECT Id FROM Account');\n  }"))).toContain("soql-in-loop");
  });
  it("ignores SELECT inside comments and strings", () => {
    expect(rules(cls("  void a(List<Id> ids) {\n    for (Id i : ids) {\n      // [SELECT Id FROM Account]\n      String s = '[SELECT Id FROM Account]';\n    }\n  }"))).not.toContain("soql-in-loop");
  });
});

describe("dml-in-loop", () => {
  it("flags update inside a loop", () => {
    expect(ids(cls("  void a(List<Account> xs) {\n    for (Account x : xs) {\n      update x;\n    }\n  }"))).toContain("dml-in-loop@4");
  });
  it("flags Database.insert inside a loop", () => {
    expect(rules(cls("  void a(List<Account> xs) {\n    for (Account x : xs) {\n      Database.insert(x, false);\n    }\n  }"))).toContain("dml-in-loop");
  });
  it("does not flag one bulk update after the loop", () => {
    expect(rules(cls("  void a(List<Account> xs) {\n    for (Account x : xs) {\n      x.Name = 'y';\n    }\n    update xs;\n  }"))).not.toContain("dml-in-loop");
  });
  it("does not flag variables whose names contain a DML keyword", () => {
    expect(rules(cls("  void a(List<Account> xs) {\n    for (Account x : xs) {\n      toUpdate.add(x);\n      Boolean isDelete = false;\n    }\n  }"))).not.toContain("dml-in-loop");
  });
});

describe("soql-injection", () => {
  it("flags concatenation inside Database.query", () => {
    expect(rules(cls("  void a(String name) {\n    Database.query('SELECT Id FROM Contact WHERE Name = \\'' + name + '\\'');\n  }"))).toContain("soql-injection");
  });
  it("flags a query string built with + and passed by variable", () => {
    expect(rules(cls("  void a(String name) {\n    String q = 'SELECT Id FROM Contact WHERE Name = ' + name;\n    Database.query(q);\n  }"))).toContain("soql-injection");
  });
  it("does not flag when input is escaped", () => {
    expect(rules(cls("  void a(String name) {\n    String q = 'SELECT Id FROM Contact WHERE Name = ' + String.escapeSingleQuotes(name);\n    Database.query(q);\n  }"))).not.toContain("soql-injection");
  });
  it("does not flag a constant query", () => {
    expect(rules(cls("  void a() {\n    Database.query('SELECT Id FROM Contact');\n  }"))).not.toContain("soql-injection");
  });
});

describe("trigger-not-bulkified", () => {
  it("flags Trigger.new[0]", () => {
    expect(rules("trigger T on Account (before insert) {\n  Account a = Trigger.new[0];\n}", "T.trigger")).toContain("trigger-not-bulkified");
  });
  it("does not flag a loop over Trigger.new", () => {
    expect(rules("trigger T on Account (before insert) {\n  for (Account a : Trigger.new) { a.Name = 'x'; }\n}", "T.trigger")).toEqual([]);
  });
});

describe("hardcoded-id", () => {
  it("flags 15 and 18 character record IDs", () => {
    expect(rules(cls("  Id a = '0015g00000AbCdE';\n  Id b = '0015g00000AbCdEAAX';"))).toEqual(["hardcoded-id", "hardcoded-id"]);
  });
  it("does not flag ordinary strings of the same length", () => {
    expect(rules(cls("  String a = 'HelloWorldAgain';\n  String b = 'Closed Won';"))).not.toContain("hardcoded-id");
  });
});

describe("missing-sharing", () => {
  it("flags a class without a sharing keyword", () => {
    expect(ids("public class NoSharing {\n}")).toEqual(["missing-sharing@1"]);
  });
  it("accepts with, without and inherited sharing", () => {
    for (const mode of ["with", "without", "inherited"]) expect(rules(`public ${mode} sharing class X {\n}`)).toEqual([]);
  });
  it("skips test classes and triggers", () => {
    expect(rules("@isTest\nprivate class XTest {\n}")).toEqual([]);
    expect(rules("trigger T on Account (before insert) {\n}", "T.trigger")).toEqual([]);
  });
  it("only checks the outer class", () => {
    expect(rules("public with sharing class Outer {\n  public class Inner {\n  }\n}")).toEqual([]);
  });
});

describe("soql-without-user-mode", () => {
  it("flags a query without WITH USER_MODE", () => {
    expect(rules(cls("  List<Account> a = [SELECT Id FROM Account];"))).toContain("soql-without-user-mode");
  });
  it("accepts USER_MODE and SECURITY_ENFORCED", () => {
    expect(rules(cls("  List<Account> a = [SELECT Id FROM Account WITH USER_MODE];\n  List<Account> b = [SELECT Id FROM Account WITH SECURITY_ENFORCED];"))).toEqual([]);
  });
  it("skips test classes", () => {
    expect(rules("@isTest\nprivate class XTest {\n  static void t() { Account a = [SELECT Id FROM Account]; }\n}")).toEqual([]);
  });
  it("accepts an explicit WITH SYSTEM_MODE as a deliberate choice", () => {
    expect(rules(cls("  List<Account> a = [SELECT Id FROM Account WITH SYSTEM_MODE];"))).toEqual([]);
  });
  it("flags a dynamic Database.query without AccessLevel.USER_MODE", () => {
    expect(rules(cls("  void a() {\n    String q = 'SELECT Id FROM Account';\n    Database.query(q);\n  }"))).toContain("soql-without-user-mode");
  });
  it("accepts a dynamic query with AccessLevel.USER_MODE or WITH USER_MODE in its text", () => {
    expect(rules(cls("  void a() {\n    Database.query('SELECT Id FROM Account', AccessLevel.USER_MODE);\n  }"))).toEqual([]);
    expect(rules(cls("  void a() {\n    String q = 'SELECT Id FROM Account WITH USER_MODE';\n    Database.query(q);\n  }"))).toEqual([]);
  });
});

describe("empty-catch", () => {
  it("flags an empty catch block", () => {
    expect(rules(cls("  void a() {\n    try { } catch (Exception e) {\n    }\n  }"))).toContain("empty-catch");
  });
  it("accepts a catch with a comment explaining the ignore", () => {
    expect(rules(cls("  void a() {\n    try { } catch (Exception e) {\n      // ignored: optional enrichment\n    }\n  }"))).not.toContain("empty-catch");
  });
});

describe("debug-statement", () => {
  it("flags System.debug in normal code", () => {
    expect(rules(cls("  void a() { System.debug('x'); }"))).toEqual(["debug-statement"]);
  });
  it("skips test classes", () => {
    expect(rules("@isTest\nprivate class XTest {\n  static void t() { System.debug('x'); }\n}")).toEqual([]);
  });
});

describe("output", () => {
  it("sorts findings by severity, then line", () => {
    const found = scan(parseApex("public class X {\n  void a(List<Account> xs) {\n    System.debug('a');\n    for (Account x : xs) { update x; }\n  }\n}", "X.cls"));
    expect(found.map((f) => f.severity)).toEqual(["high", "medium", "low"]);
  });
  it("reports correct line numbers after multi-line comments", () => {
    expect(ids("/*\n line 2\n line 3\n*/\npublic class X {\n}")).toEqual(["missing-sharing@5"]);
  });
});
