/**
 * [INPUT]: 依赖 Obsidian PluginSettingTab/Setting 与 storage/types 的设置模型
 * [OUTPUT]: 对外提供 AnnotationSettingsTab，负责默认颜色、便签栏、窄屏折叠、连接线、作者、备份、重命名迁移设置
 * [POS]: settings 模块的用户配置界面，被 main.ts 注册
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { PluginSettingTab, Setting } from "obsidian";

import type OverlayAnnotationsPlugin from "../../main";
import { getColorLabel, t } from "../i18n/helpers";
import { ANNOTATION_COLORS, AnnotationColor, SidebarSide } from "../storage/types";

export class AnnotationSettingsTab extends PluginSettingTab {
  constructor(private readonly plugin: OverlayAnnotationsPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: t("settings.heading") });

    new Setting(containerEl)
      .setName(t("settings.defaultHighlightColor.name"))
      .addDropdown((dropdown) => {
        for (const color of ANNOTATION_COLORS) {
          dropdown.addOption(color, getColorLabel(color));
        }
        dropdown.setValue(this.plugin.settings.defaultHighlightColor).onChange(async (value) => {
          this.plugin.settings.defaultHighlightColor = value as AnnotationColor;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t("settings.stickyNoteWidth.name"))
      .addSlider((slider) => {
        slider
          .setLimits(220, 420, 10)
          .setValue(this.plugin.settings.stickyWidth)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.stickyWidth = value;
            await this.plugin.saveSettings();
            this.plugin.refreshAnnotations();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.stickyNoteSide.name"))
      .setDesc(t("settings.stickyNoteSide.desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("right", t("settings.stickyNoteSide.optionRight"));
        dropdown.addOption("left", t("settings.stickyNoteSide.optionLeft"));
        dropdown.setValue(this.plugin.settings.stickySide).onChange(async (value) => {
          this.plugin.settings.stickySide = value as SidebarSide;
          await this.plugin.saveSettings();
          this.plugin.refreshAnnotations();
        });
      });

    new Setting(containerEl)
      .setName(t("settings.collapseStickyLane.name"))
      .setDesc(t("settings.collapseStickyLane.desc"))
      .addSlider((slider) => {
        slider
          .setLimits(640, 1200, 20)
          .setValue(this.plugin.settings.stickyCollapseWidth)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.stickyCollapseWidth = value;
            await this.plugin.saveSettings();
            this.plugin.refreshAnnotations();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.showLeaderLines.name"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showLeaderLines).onChange(async (value) => {
          this.plugin.settings.showLeaderLines = value;
          await this.plugin.saveSettings();
          this.plugin.refreshAnnotations();
        });
      });

    new Setting(containerEl)
      .setName(t("settings.defaultAuthor.name"))
      .addText((text) => {
        text.setValue(this.plugin.settings.defaultAuthor).onChange(async (value) => {
          this.plugin.settings.defaultAuthor = value.trim() || t("settings.defaultAuthor.fallbackAuthor");
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t("settings.dataBackupFrequency.name"))
      .setDesc(t("settings.dataBackupFrequency.desc"))
      .addSlider((slider) => {
        slider
          .setLimits(5, 240, 5)
          .setValue(this.plugin.settings.backupFrequencyMinutes)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.backupFrequencyMinutes = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.migrateOnRename.name"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.migrateOnRename).onChange(async (value) => {
          this.plugin.settings.migrateOnRename = value;
          await this.plugin.saveSettings();
        });
      });
  }
}
